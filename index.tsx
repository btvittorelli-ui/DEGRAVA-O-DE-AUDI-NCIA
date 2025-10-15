/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = "gemini-2.5-pro";

const state = {
  pdfFile: null as File | null,
  videoFiles: [] as File[],
  isProcessing: false,
};

// DOM Elements
const dropZone = document.getElementById('drop-zone')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const fileList = document.getElementById('file-list')!;
const additionalInfo = document.getElementById('additional-info') as HTMLTextAreaElement;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const progressContainer = document.getElementById('progress-container')!;
const progressBar = document.getElementById('progress-bar')!;
const progressLabel = document.getElementById('progress-label')!;
const outputText = document.getElementById('output-text') as HTMLTextAreaElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
const anonymizeBtn = document.getElementById('anonymize-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const correctionInput = document.getElementById('correction-input') as HTMLInputElement;
const correctBtn = document.getElementById('correct-btn') as HTMLButtonElement;

// File Handling & UI
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer?.files) {
    handleFiles(e.dataTransfer.files);
  }
});
fileInput.addEventListener('change', () => {
  if (fileInput.files) {
    handleFiles(fileInput.files);
  }
});

function handleFiles(files: FileList) {
  for (const file of files) {
    if (file.type === 'application/pdf' && !state.pdfFile) {
      state.pdfFile = file;
    } else if (file.type.startsWith('video/')) {
      state.videoFiles.push(file);
    }
  }
  updateFileList();
  updateStartButtonState();
}

function updateFileList() {
  fileList.innerHTML = '';
  if (state.pdfFile) {
    const el = document.createElement('div');
    el.textContent = `Ata: ${state.pdfFile.name}`;
    fileList.appendChild(el);
  }
  state.videoFiles.forEach((file, index) => {
    const el = document.createElement('div');
    el.className = 'video';
    el.textContent = `Vídeo ${index + 1}: ${file.name}`;
    fileList.appendChild(el);
  });
}

function updateStartButtonState() {
  startBtn.disabled = !state.pdfFile || state.videoFiles.length === 0 || state.isProcessing;
}

function setProcessingState(isProcessing: boolean) {
    state.isProcessing = isProcessing;
    fileInput.disabled = isProcessing;
    startBtn.disabled = isProcessing;
    additionalInfo.disabled = isProcessing;
    correctBtn.disabled = isProcessing;
    anonymizeBtn.disabled = isProcessing;
    progressContainer.style.display = isProcessing ? 'flex' : 'none';
    if (!isProcessing) {
        updateStartButtonState();
    }
}

// Main Logic
startBtn.addEventListener('click', async () => {
  if (!state.pdfFile || state.videoFiles.length === 0) {
    alert('Por favor, envie o arquivo PDF da ata e pelo menos um arquivo de vídeo.');
    return;
  }
  
  setProcessingState(true);
  outputText.value = '';
  outputText.readOnly = true;

  try {
    // Step 1: Extract participants from PDF
    updateProgress(0, 'Analisando PDF...');
    const pdfPart = await fileToGenerativePart(state.pdfFile);
    const participantPrompt = `Analise a ata de audiência em PDF e extraia o nome completo e a função de todos os participantes (Juiz, promotor, partes, advogados, testemunhas, etc.). Retorne uma lista clara.`;
    const participantResult = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [pdfPart, {text: participantPrompt}] }],
    });
    const participants = participantResult.text;
    updateProgress(10, `Participantes identificados. Transcrevendo ${state.videoFiles.length} vídeo(s)...`);

    // Step 2: Transcribe videos
    const totalVideos = state.videoFiles.length;
    for (let i = 0; i < totalVideos; i++) {
        const videoFile = state.videoFiles[i];
        const progressStart = 10 + (i / totalVideos) * 90;
        updateProgress(progressStart, `Processando vídeo ${i + 1} de ${totalVideos}: ${videoFile.name}`);
        
        const videoPart = await fileToGenerativePart(videoFile);
        const transcriptionPrompt = `
            Você é um assistente de degravação para um Juiz de Direito. Sua função é transcrever o vídeo da audiência judicial.
            - Transcreva EXATAMENTE o que for dito. Não deduza, não presuma, não invente.
            - A transcrição deve ser literal, linha por linha, no formato: "Nome do Interlocutor – Função – O que foi dito.".
            - Use a lista de participantes a seguir para identificar quem está falando: ${participants}.
            - Se não for possível identificar um interlocutor com certeza, use "Pessoa não identificada X".
            - Considere estas informações adicionais do usuário: "${additionalInfo.value || 'Nenhuma'}".
            - Comece a transcrição.
        `;
        
        outputText.value += `\n\n--- INÍCIO DA DEGRAVAÇÃO DO VÍDEO: ${videoFile.name} ---\n\n`;
        
        const response = await ai.models.generateContentStream({
            model,
            contents: [{ role: 'user', parts: [videoPart, {text: transcriptionPrompt}]}]
        });

        for await (const chunk of response) {
            outputText.value += chunk.text;
            outputText.scrollTop = outputText.scrollHeight; // Auto-scroll
        }

        outputText.value += `\n\n--- FIM DA DEGRAVAÇÃO DO VÍDEO: ${videoFile.name} ---`;
    }
    
    updateProgress(100, 'Processo concluído!');
    outputText.readOnly = false;
  } catch (error) {
    console.error(error);
    progressLabel.textContent = 'Ocorreu um erro.';
    alert('Ocorreu um erro durante o processo. Verifique o console para mais detalhes.');
  } finally {
    setProcessingState(false);
  }
});

// Action Buttons
copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(outputText.value)
        .then(() => alert('Texto copiado para a área de transferência!'))
        .catch(err => alert('Falha ao copiar o texto.'));
});

clearBtn.addEventListener('click', () => {
    state.pdfFile = null;
    state.videoFiles = [];
    additionalInfo.value = '';
    outputText.value = '';
    correctionInput.value = '';
    updateFileList();
    updateStartButtonState();
});

anonymizeBtn.addEventListener('click', async () => {
    if (!outputText.value) return;
    setProcessingState(true);
    updateProgress(0, "Anonimizando o texto...");
    try {
        const prompt = `Anonimize integralmente o texto a seguir. Substitua nomes de partes, pessoas e empresas apenas pelas iniciais. Substitua endereços apenas pelas iniciais. Substitua valores monetários por "x".\n\n${outputText.value}`;
        const result = await ai.models.generateContent({ model, contents: prompt });
        outputText.value = result.text;
        updateProgress(100, "Texto anonimizado!");
    } catch (error) {
        console.error("Anonymization error:", error);
        alert("Falha ao anonimizar o texto.");
    } finally {
        setProcessingState(false);
    }
});

correctBtn.addEventListener('click', async () => {
    const correction = correctionInput.value;
    if (!outputText.value || !correction) return;
    setProcessingState(true);
    updateProgress(0, "Aplicando correção...");
    try {
        const prompt = `Aplique a seguinte correção ao texto da transcrição. Devolva apenas o texto completo e corrigido, sem comentários adicionais.\n\nCorreção: "${correction}"\n\nTexto original:\n${outputText.value}`;
        const result = await ai.models.generateContent({ model, contents: prompt });
        outputText.value = result.text;
        correctionInput.value = '';
        updateProgress(100, "Correção aplicada!");
    } catch (error) {
        console.error("Correction error:", error);
        alert("Falha ao aplicar a correção.");
    } finally {
        setProcessingState(false);
    }
});


// Helper functions
function updateProgress(percentage: number, label: string) {
  progressBar.style.width = `${percentage}%`;
  progressLabel.textContent = label;
}

async function fileToGenerativePart(file: File) {
  const base64EncodedData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: {
      data: base64EncodedData,
      mimeType: file.type,
    },
  };
}
