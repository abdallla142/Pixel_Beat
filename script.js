document.addEventListener('DOMContentLoaded', () => {
  const PixelBeat = {
    dom: {
      gridContainer: document.getElementById('grid-container'),
      noteLabelsContainer: document.getElementById('note-labels-container'),
      playBtn: document.getElementById('play-btn'),
      clearBtn: document.getElementById('clear-btn'),
      bpmSlider: document.getElementById('bpm-slider'),
      bpmValueSpan: document.getElementById('bpm-value'),
      gridSizeInput: document.getElementById('grid-size-input'),
      aiChatInput: document.getElementById('ai-chat-input'),
      aiChatSendBtn: document.getElementById('ai-chat-send'),
      aiChatBox: document.getElementById('ai-chat-box'),
      playhead: document.getElementById('playhead'),
    },

    state: {
      gridSize: 16,
      maxGridSize: 64,
      bpm: 120,
      isPlaying: false,
      currentStep: 0,
      tiles: [],
      noteFrequencies: [],
      noteNames: [],
      isDragging: false,
      dragMode: 'activate',
      audioContext: null,
      nextNoteTime: 0,
      lookahead: 25,
      scheduleAheadTime: 0.1,
      timerID: null,
      chatHistory: [],
    },

    init() {
      this.state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.generateNoteData();
      this.setupEventListeners();
      this.createGrid();
      this.updateBpmUI();
    },

    generateNoteData() {
      this.state.noteNames = [];
      this.state.noteFrequencies = [];
      const scale = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
      for (let i = 0; i < this.state.maxGridSize; i++) {
        const midi = 95 - i;
        if (midi < 0) break;
        const note = scale[midi % 12];
        const octave = Math.floor(midi / 12) - 1;
        this.state.noteNames.push(`${note}${octave}`);
        this.state.noteFrequencies.push(440 * Math.pow(2, (midi - 69) / 12));
      }
    },

    setupEventListeners() {
      this.dom.playBtn.addEventListener('click', () => this.togglePlayback());
      this.dom.clearBtn.addEventListener('click', () => this.clearGrid());
      this.dom.bpmSlider.addEventListener('input', (e) => this.handleBpmChange(e));
      this.dom.gridSizeInput.addEventListener('change', (e) => this.handleGridSizeChange(e));
      this.dom.gridContainer.addEventListener('mousedown', (e) => this.handleGridMouseDown(e));
      this.dom.gridContainer.addEventListener('mouseover', (e) => this.handleGridMouseOver(e));
      window.addEventListener('mouseup', () => this.state.isDragging = false);
      this.dom.gridContainer.addEventListener('mouseleave', () => this.state.isDragging = false);
      this.dom.aiChatSendBtn.addEventListener('click', () => this.handleAIChat());
      this.dom.aiChatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleAIChat();
        }
      });
    },

    createGrid() {
      this.stopPlayback();
      document.documentElement.style.setProperty('--grid-size-var', this.state.gridSize);
      this.dom.gridContainer.innerHTML = '';
      this.state.tiles = [];
      const totalTiles = this.state.gridSize ** 2;
      for (let i = 0; i < totalTiles; i++) {
        const tile = document.createElement('div');
        tile.classList.add('tile');
        tile.dataset.row = Math.floor(i / this.state.gridSize);
        tile.dataset.col = i % this.state.gridSize;
        tile.tabIndex = 0;
        this.dom.gridContainer.appendChild(tile);
        this.state.tiles.push(tile);
      }
      this.populateNoteLabels();
    },

    populateNoteLabels() {
      this.dom.noteLabelsContainer.innerHTML = '';
      for (let i = 0; i < this.state.gridSize; i++) {
        const label = document.createElement('div');
        label.classList.add('note-label');
        label.textContent = this.state.noteNames[i];
        this.dom.noteLabelsContainer.appendChild(label);
      }
    },

    playNoteAtTime(row, time) {
      if (row >= this.state.gridSize) return;
      const freq = this.state.noteFrequencies[row];
      const ctx = this.state.audioContext;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(freq, time);
      gainNode.gain.setValueAtTime(0.0, time);
      gainNode.gain.linearRampToValueAtTime(0.3, time + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start(time);
      oscillator.stop(time + 0.45);
    },

    scheduler() {
      while (this.state.nextNoteTime < this.state.audioContext.currentTime + this.state.scheduleAheadTime) {
        this.scheduleStep(this.state.currentStep, this.state.nextNoteTime);
        this.nextStep();
      }
      this.state.timerID = setTimeout(() => this.scheduler(), this.state.lookahead);
    },

    scheduleStep(step, time) {
      this.updatePlayheadPosition(step);
      for (let row = 0; row < this.state.gridSize; row++) {
        const index = row * this.state.gridSize + step;
        if (this.state.tiles[index]?.classList.contains('active')) {
          this.playNoteAtTime(row, time);
        }
      }
    },

    nextStep() {
      const secondsPerBeat = 60.0 / this.state.bpm;
      this.state.nextNoteTime += secondsPerBeat / 4;
      this.state.currentStep = (this.state.currentStep + 1) % this.state.gridSize;
    },

    updatePlayheadPosition(step = this.state.currentStep) {
      const rect = this.dom.gridContainer.getBoundingClientRect();
      const stepWidth = rect.width / this.state.gridSize;
      this.dom.playhead.style.transform = `translateX(${step * stepWidth}px)`;
      this.dom.playhead.style.width = `${stepWidth}px`;
    },

    togglePlayback() {
      this.state.isPlaying ? this.stopPlayback() : this.startPlayback();
    },

    startPlayback() {
      if (this.state.isPlaying) return;
      this.state.audioContext.resume();
      this.state.isPlaying = true;
      this.dom.playBtn.textContent = 'Stop';
      this.dom.playBtn.classList.add('playing');
      this.dom.playhead.classList.add('visible');
      this.state.currentStep = 0;
      this.state.nextNoteTime = this.state.audioContext.currentTime + 0.05;
      this.scheduler();
    },

    stopPlayback() {
      if (!this.state.isPlaying) return;
      this.state.isPlaying = false;
      clearTimeout(this.state.timerID);
      this.state.timerID = null;
      this.dom.playBtn.textContent = 'Play';
      this.dom.playBtn.classList.remove('playing');
      this.dom.playhead.classList.remove('visible');
      this.state.currentStep = 0;
      this.updatePlayheadPosition(0);
    },

    clearGrid() {
      this.stopPlayback();
      this.state.tiles.forEach(tile => this.updateTileVisuals(tile, false, parseInt(tile.dataset.row)));
    },

    toggleTile(tile, forceState) {
      if (!tile.classList.contains('tile')) return;
      const row = parseInt(tile.dataset.row);
      const currentState = tile.classList.contains('active');
      let newState;
      if (forceState === 'activate') newState = true;
      else if (forceState === 'deactivate') newState = false;
      else newState = !currentState;
      if (newState !== currentState) {
        this.updateTileVisuals(tile, newState, row);
        if (newState && !this.state.isPlaying) this.playNoteAtTime(row, this.state.audioContext.currentTime);
      }
    },

    updateTileVisuals(tile, isActive, row) {
      if (isActive) {
        tile.classList.add('active');
        const hue = (row / (this.state.gridSize - 1)) * 300;
        const color = `hsl(${hue}, 90%, 60%)`;
        tile.style.backgroundColor = color;
        tile.style.setProperty('--active-color', color);
      } else {
        tile.classList.remove('active');
        tile.style.backgroundColor = '';
        tile.style.removeProperty('--active-color');
      }
    },

    handleGridMouseDown(e) {
      e.preventDefault();
      this.state.audioContext.resume();
      this.state.isDragging = true;
      const targetTile = e.target;
      if (targetTile.classList.contains('tile')) {
        this.state.dragMode = targetTile.classList.contains('active') ? 'deactivate' : 'activate';
        this.toggleTile(targetTile, this.state.dragMode);
      }
    },

    handleGridMouseOver(e) {
      if (this.state.isDragging) this.toggleTile(e.target, this.state.dragMode);
    },

    handleBpmChange(e) {
      this.state.bpm = parseInt(e.target.value);
      this.updateBpmUI();
      if (this.state.isPlaying) {
        this.stopPlayback();
        this.startPlayback();
      }
    },

    updateBpmUI() {
      this.dom.bpmValueSpan.textContent = this.state.bpm;
      this.dom.bpmSlider.value = this.state.bpm;
    },

    handleGridSizeChange(e) {
      let newSize = parseInt(e.target.value);
      if (isNaN(newSize)) newSize = this.state.gridSize;
      newSize = Math.max(4, Math.min(newSize, this.state.maxGridSize));
      this.state.gridSize = newSize;
      this.dom.gridSizeInput.value = newSize;
      this.createGrid();
    },

    addMessageToChat(content, sender) {
      const message = document.createElement('div');
      message.classList.add('chat-message', sender);
      message.textContent = content;
      this.dom.aiChatBox.appendChild(message);
      this.dom.aiChatBox.scrollTop = this.dom.aiChatBox.scrollHeight;
      return message;
    },

    async handleAIChat() {
      const userRequest = this.dom.aiChatInput.value.trim();
      if (!userRequest) return;
      this.addMessageToChat(userRequest, 'user');
      this.dom.aiChatInput.value = '';
      const loading = this.addMessageToChat('🎵 Thinking about your request...', 'loading');
      this.dom.aiChatSendBtn.disabled = true;
      this.dom.aiChatInput.disabled = true;

      this.state.chatHistory.push({ role: 'user', content: userRequest });

      try {
        const gridSize = this.state.gridSize;
        const notesContext = this.state.noteNames.slice(0, gridSize).map((name, i) => `Row ${i} is ${name}`).join('; ');

        const systemPrompt = `
You are a creative AI music assistant for a ${gridSize}x${gridSize} step sequencer.
You must detect if the user is requesting a song pattern or asking a question.
If it is a song pattern request, respond in TWO parts:
1. A friendly, creative description of the pattern you are making.
2. A JSON array of objects with "row" and "column" fields representing active tiles ONLY.
If it is a question or general chat, respond normally.
Do not include any text after the JSON if responding with a pattern.
Note map: ${notesContext}
Conversation history:
${this.state.chatHistory.map(m => `${m.role}: ${m.content}`).join('\n')}
`;

        const response = await fetch('https://ai.hackclub.com/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userRequest }
            ]
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`API error ${response.status}: ${text}`);
        }

        const data = await response.json();

        if (!data.choices || !data.choices[0]) {
          throw new Error('API returned unexpected response format');
        }

        const aiContent = data.choices[0].message.content.trim();

        loading.remove();

        const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const description = aiContent.slice(0, aiContent.indexOf(jsonMatch[0])).trim();
          if (description) this.addMessageToChat(description, 'ai');
          const positions = JSON.parse(jsonMatch[0]);
          this.clearGrid();
          positions.forEach(({ row, column }) => {
            if (row < gridSize && column < gridSize) {
              const index = row * gridSize + column;
              this.updateTileVisuals(this.state.tiles[index], true, row);
            }
          });
          this.addMessageToChat('✅ Your beat is ready! Press play to listen! 🎶', 'ai');
        } else {
          this.addMessageToChat(aiContent, 'ai');
        }

        this.state.chatHistory.push({ role: 'assistant', content: aiContent });

      } catch (error) {
        loading.remove();
        this.addMessageToChat(`😔 Oops! ${error.message}`, 'ai');
        console.error(error);
      } finally {
        this.dom.aiChatSendBtn.disabled = false;
        this.dom.aiChatInput.disabled = false;
        this.dom.aiChatInput.focus();
      }
    }
  };

  PixelBeat.init();
});
