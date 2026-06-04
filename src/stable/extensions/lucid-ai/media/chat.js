(function () {
    const vscode = acquireVsCodeApi();

    // DOM Elements
    const statusIndicator = document.getElementById('statusIndicator');
    const statusDot = statusIndicator.querySelector('.status-dot');
    const statusText = statusIndicator.querySelector('.status-text');
    
    const modelSelectBtn = document.getElementById('modelSelectBtn');
    const activeModelName = modelSelectBtn.querySelector('.active-model-name');
    
    const modelDrawer = document.getElementById('modelDrawer');
    const closeDrawerBtn = document.getElementById('closeDrawerBtn');
    const modelsList = document.getElementById('modelsList');
    
    const chatArea = document.getElementById('chatArea');
    const chatWelcome = document.getElementById('chatWelcome');
    const setupNotice = document.getElementById('setupNotice');
    const quickStartNotice = document.getElementById('quickStartNotice');
    const reconnectBtn = document.getElementById('reconnectBtn');
    const openManagerBtn = document.getElementById('openManagerBtn');
    const installBtn = document.getElementById('installBtn');
    const installProgressContainer = document.getElementById('installProgressContainer');
    const installProgressBar = document.getElementById('installProgressBar');
    const installStatusText = document.getElementById('installStatusText');
    const ollamaVersionSelect = document.getElementById('ollamaVersionSelect');
    const installDirInput = document.getElementById('installDirInput');
    const browseDirBtn = document.getElementById('browseDirBtn');
    const cancelInstallBtn = document.getElementById('cancelInstallBtn');
    
    const messagesContainer = document.getElementById('messagesContainer');
    const promptInput = document.getElementById('promptInput');
    const sendBtn = document.getElementById('sendBtn');
    const inputToolbar = document.getElementById('inputToolbar');
    const quickCommitBtn = document.getElementById('quickCommitBtn');
    const chatsHistoryBtn = document.getElementById('chatsHistoryBtn');
    const chatsDrawer = document.getElementById('chatsDrawer');
    const closeChatsDrawerBtn = document.getElementById('closeChatsDrawerBtn');
    const saveCurrentChatBtn = document.getElementById('saveCurrentChatBtn');
    const chatsList = document.getElementById('chatsList');

    // State
    let isConnected = false;
    let localModels = []; // Models actually downloaded in Ollama
    let selectedModel = '';
    let chatHistory = [];
    let isGenerating = false;
    let activeAssistantBubble = null;
    let activeResponseText = '';
    
    // Code blocks store for copy/insert actions
    let activeCodeBlocks = [];

    // Recommended models list
    const recommendedModels = [
        // Reasoning Models
        { id: 'deepseek-r1:1.5b', name: 'DeepSeek R1 (1.5B Distill)', sizeLabel: '900 MB' },
        { id: 'deepseek-r1:8b', name: 'DeepSeek R1 (8B Distill)', sizeLabel: '4.7 GB' },
        { id: 'deepseek-r1:14b', name: 'DeepSeek R1 (14B Distill)', sizeLabel: '9.0 GB' },
        
        // Coding Specific Models
        { id: 'qwen2.5-coder:1.5b', name: 'Qwen 2.5 Coder (1.5B)', sizeLabel: '1.6 GB' },
        { id: 'qwen2.5-coder:7b', name: 'Qwen 2.5 Coder (7B)', sizeLabel: '4.7 GB' },
        { id: 'deepseek-coder:1.5b', name: 'DeepSeek Coder (1.5B)', sizeLabel: '960 MB' },
        { id: 'deepseek-coder:6.7b', name: 'DeepSeek Coder (6.7B)', sizeLabel: '3.8 GB' },
        { id: 'codestral:latest', name: 'Codestral (22B)', sizeLabel: '13.0 GB' },

        // General Purpose / Lightweight Models
        { id: 'llama3.2:1b', name: 'Llama 3.2 (1B)', sizeLabel: '1.3 GB' },
        { id: 'llama3.2:3b', name: 'Llama 3.2 (3B)', sizeLabel: '2.0 GB' },
        { id: 'gemma2:2b', name: 'Gemma 2 (2B)', sizeLabel: '1.6 GB' },
        { id: 'gemma2:9b', name: 'Gemma 2 (9B)', sizeLabel: '5.5 GB' },
        { id: 'phi3:latest', name: 'Phi 3 Mini (3.8B)', sizeLabel: '2.2 GB' },
        { id: 'phi4:latest', name: 'Phi 4 (14B)', sizeLabel: '9.1 GB' },
        { id: 'mistral:latest', name: 'Mistral (7B)', sizeLabel: '4.1 GB' }
    ];

    // Initialize
    function init() {
        // Event Listeners
        reconnectBtn.addEventListener('click', checkStatus);
        if (installBtn) {
            installBtn.addEventListener('click', startOllamaInstall);
        }
        if (browseDirBtn) {
            browseDirBtn.addEventListener('click', () => {
                vscode.postMessage({ command: 'selectInstallDir' });
            });
        }
        if (cancelInstallBtn) {
            cancelInstallBtn.addEventListener('click', () => {
                vscode.postMessage({ command: 'cancelInstall' });
            });
        }
        statusIndicator.addEventListener('click', checkStatus);
        openManagerBtn.addEventListener('click', openDrawer);
        modelSelectBtn.addEventListener('click', openDrawer);
        closeDrawerBtn.addEventListener('click', closeDrawer);

        // Chats drawer
        if (chatsHistoryBtn) chatsHistoryBtn.addEventListener('click', openChatsDrawer);
        if (closeChatsDrawerBtn) closeChatsDrawerBtn.addEventListener('click', closeChatsDrawer);
        if (saveCurrentChatBtn) {
            saveCurrentChatBtn.addEventListener('click', () => {
                if (chatHistory.length === 0) { showToast('Nothing to save — start a chat first.'); return; }
                vscode.postMessage({ command: 'saveChat', name: '', model: selectedModel, messages: chatHistory });
            });
        }
        // Load chats list when drawer opens
        vscode.postMessage({ command: 'listChats' });
        
        sendBtn.addEventListener('click', submitPrompt);
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitPrompt();
            }
        });

        // Event delegation for copy, insert & run buttons in code blocks
        messagesContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('copy-btn')) {
                const idx = parseInt(e.target.getAttribute('data-index'), 10);
                if (activeCodeBlocks[idx]) {
                    vscode.postMessage({ command: 'copyCode', code: activeCodeBlocks[idx] });
                }
            } else if (e.target.classList.contains('insert-btn')) {
                const idx = parseInt(e.target.getAttribute('data-index'), 10);
                if (activeCodeBlocks[idx]) {
                    vscode.postMessage({ command: 'insertCode', code: activeCodeBlocks[idx] });
                }
            } else if (e.target.classList.contains('run-btn')) {
                const idx = parseInt(e.target.getAttribute('data-index'), 10);
                if (activeCodeBlocks[idx]) {
                    vscode.postMessage({ command: 'runInTerminal', code: activeCodeBlocks[idx] });
                }
            }
        });

        // Auto-resize textarea
        if (quickCommitBtn) {
            quickCommitBtn.addEventListener('click', () => {
                vscode.postMessage({ command: 'generateCommit' });
            });
        }

        // Auto-resize textarea
        promptInput.addEventListener('input', () => {
            promptInput.style.height = 'auto';
            promptInput.style.height = (promptInput.scrollHeight) + 'px';
        });

        // Intercept external link clicks
        document.addEventListener('click', (e) => {
            const target = e.target.closest('a');
            if (target && target.href && (target.href.startsWith('http://') || target.href.startsWith('https://'))) {
                e.preventDefault();
                vscode.postMessage({ command: 'openExternal', url: target.href });
            }
        });

        // Initialize state
        checkStatus();
        setInterval(checkStatus, 30000); // Check status every 30s
    }

    function checkStatus() {
        vscode.postMessage({ command: 'checkStatus' });
    }

    function openDrawer() {
        modelDrawer.style.display = 'flex';
        if (chatsDrawer) chatsDrawer.style.display = 'none';
    }

    function closeDrawer() {
        modelDrawer.style.display = 'none';
    }

    function openChatsDrawer() {
        if (chatsDrawer) {
            chatsDrawer.style.display = 'flex';
            modelDrawer.style.display = 'none';
            vscode.postMessage({ command: 'listChats' });
        }
    }

    function closeChatsDrawer() {
        if (chatsDrawer) chatsDrawer.style.display = 'none';
    }

    function renderChatsList(chats) {
        if (!chatsList) return;
        chatsList.innerHTML = '';
        if (!chats || chats.length === 0) {
            chatsList.innerHTML = '<div style="padding:20px; text-align:center; opacity:0.55; font-size:12px;">No saved chats yet.<br>Click "Save Current Chat" to save one.</div>';
            return;
        }
        chats.forEach(chat => {
            const card = document.createElement('div');
            card.className = 'model-card';
            card.style.cssText = 'flex-direction: column; align-items: flex-start; gap: 6px; padding: 10px 12px;';
            const date = new Date(chat.savedAt);
            const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            card.innerHTML = `
                <div style="width:100%; display:flex; align-items:flex-start; justify-content:space-between; gap:6px;">
                    <div style="flex:1; min-width:0;">
                        <div class="chat-session-name" data-id="${chat.id}" style="font-weight:600; font-size:12px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="Click to rename">${escapeHtml(chat.name)}</div>
                        <div style="font-size:10px; opacity:0.55; margin-top:2px;">${dateStr} · ${chat.model || 'Unknown'} · ${chat.messageCount} msgs</div>
                    </div>
                    <div style="display:flex; gap:4px; flex-shrink:0;">
                        <button class="btn btn-sm btn-secondary load-chat-btn" data-id="${chat.id}" style="padding:2px 7px; font-size:10px;">Load</button>
                        <button class="btn btn-sm btn-danger delete-chat-btn" data-id="${chat.id}" style="padding:2px 7px; font-size:10px;">Delete</button>
                    </div>
                </div>
            `;
            // Click name to rename
            card.querySelector('.chat-session-name').addEventListener('click', () => {
                const newName = prompt('Rename chat:', chat.name);
                if (newName && newName.trim()) {
                    vscode.postMessage({ command: 'renameChat', id: chat.id, name: newName.trim() });
                }
            });
            card.querySelector('.load-chat-btn').addEventListener('click', () => {
                vscode.postMessage({ command: 'loadChat', id: chat.id });
                closeChatsDrawer();
            });
            card.querySelector('.delete-chat-btn').addEventListener('click', () => {
                if (confirm(`Delete "${chat.name}"?`)) {
                    vscode.postMessage({ command: 'deleteChat', id: chat.id });
                }
            });
            chatsList.appendChild(card);
        });
    }

    function escapeHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function showToast(msg) {
        let toast = document.getElementById('chatToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'chatToast';
            toast.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:var(--brand-primary);color:#fff;padding:6px 14px;border-radius:6px;font-size:11px;z-index:9999;pointer-events:none;transition:opacity 0.3s;';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.opacity = '1';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
    }

    function submitPrompt() {
        const text = promptInput.value.trim();
        if (!text || isGenerating || !selectedModel) return;

        promptInput.value = '';
        promptInput.style.height = 'auto';
        
        // Hide welcome if visible
        chatWelcome.style.display = 'none';

        // Add user message
        addMessageBubble('user', text);
        chatHistory.push({ role: 'user', content: text });

        // Add assistant typing bubble
        activeAssistantBubble = addMessageBubble('assistant', '<div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>');
        activeResponseText = '';
        
        // Scroll to bottom
        scrollToBottom();

        // Lock inputs
        isGenerating = true;
        promptInput.disabled = true;
        sendBtn.disabled = true;

        // Send to backend
        vscode.postMessage({
            command: 'sendMessage',
            model: selectedModel,
            messages: chatHistory
        });
    }

    function addMessageBubble(role, htmlContent) {
        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${role}`;
        bubble.innerHTML = htmlContent;
        messagesContainer.appendChild(bubble);
        scrollToBottom();
        return bubble;
    }

    function scrollToBottom() {
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    function formatMarkdown(text) {
        // Escape HTML tags to prevent injections, keeping double-escapes safe
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Parse code blocks: ```lang\ncode\n```
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const index = activeCodeBlocks.length;
            const trimmedCode = code.replace(/^\n+|\n+$/g, ''); // Trim leading/trailing newlines
            activeCodeBlocks.push(trimmedCode);
            
            const lowerLang = (lang || '').toLowerCase();
            const terminalLangs = ['bash', 'sh', 'powershell', 'cmd', 'shell', 'zsh'];
            const terminalPrefixes = ['git', 'npm', 'yarn', 'pnpm', 'npx', 'cargo', 'pip', 'python', 'node', 'docker', 'kubectl', 'go', 'make', 'g\\+\\+', 'gcc', 'clang'];
            const isTerminal = terminalLangs.includes(lowerLang) ||
                               new RegExp('^(' + terminalPrefixes.join('|') + ')\\s', 'i').test(trimmedCode.trim());
            const runButtonHtml = isTerminal ? `<button class="code-action-btn run-btn" data-index="${index}" style="color: var(--brand-primary); font-weight: bold;">Run</button>` : '';

            return `
                <div class="code-block-container">
                    <div class="code-block-header">
                        <span class="code-block-lang">${lang || 'code'}</span>
                        <div class="code-block-actions">
                            ${runButtonHtml}
                            <button class="code-action-btn copy-btn" data-index="${index}">Copy</button>
                            <button class="code-action-btn insert-btn" data-index="${index}">Insert</button>
                        </div>
                    </div>
                    <pre class="code-block-body"><code>${trimmedCode}</code></pre>
                </div>
            `;
        });

        // Inline code: `code`
        html = html.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

        // Bold: **text**
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Bullet lists
        html = html.replace(/(?:^|\n)[*-]\s+(.+)/g, '\n<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');

        // Paragraph formatting (double newlines)
        const paragraphs = html.split('\n\n');
        html = paragraphs.map(p => {
            if (p.trim().startsWith('<div class="code-block-container">') || p.trim().startsWith('<ul>')) {
                return p;
            }
            return `<p>${p.trim().replace(/\n/g, '<br>')}</p>`;
        }).join('');

        return html;
    }

    // Handle messages from extension backend
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.command) {
            case 'statusUpdate':
                isConnected = message.connected;
                localModels = message.models;
                
                // Hide install container if connected successfully
                if (isConnected && installProgressContainer) {
                    installProgressContainer.style.display = 'none';
                }
                
                // Populate default path if empty
                if (installDirInput && !installDirInput.value && message.defaultPath) {
                    installDirInput.value = message.defaultPath;
                }

                // Change button text depending on whether it's locally installed
                if (installBtn) {
                    if (message.localInstalled) {
                        installBtn.innerText = 'Start Ollama';
                        const setupForm = document.getElementById('setupForm');
                        if (setupForm) setupForm.style.display = 'none';
                    } else {
                        installBtn.innerText = 'Install & Start Ollama';
                        const setupForm = document.getElementById('setupForm');
                        if (setupForm) setupForm.style.display = 'flex';
                    }
                }

                updateStatusBar();
                renderModelsDrawer();
                updateMainView();
                break;
                
            case 'installProgress':
                showInstallProgress(message.percent, message.statusText);
                break;
                
            case 'installError':
                showInstallError(message.error);
                break;

            case 'installDirSelected':
                if (installDirInput) {
                    installDirInput.value = message.path;
                }
                break;

            case 'installCancelled':
                installProgressContainer.style.display = 'none';
                installProgressBar.style.width = '0%';
                installStatusText.innerText = '';
                installBtn.disabled = false;
                if (ollamaVersionSelect) ollamaVersionSelect.disabled = false;
                if (browseDirBtn) browseDirBtn.disabled = false;
                break;
                
            case 'pullProgress':
                updatePullProgress(message.model, message.status, message.percent, message.completed, message.total);
                break;
                
            case 'pullSuccess':
                updatePullSuccess(message.model);
                break;
                
            case 'pullError':
                updatePullError(message.model, message.error);
                break;

            case 'chatChunk':
                if (activeAssistantBubble) {
                    // Remove typing indicator if present
                    const indicator = activeAssistantBubble.querySelector('.typing-indicator');
                    if (indicator) {
                        activeAssistantBubble.innerHTML = '';
                    }
                    activeResponseText += message.text;
                    activeAssistantBubble.innerHTML = formatMarkdown(activeResponseText);
                    scrollToBottom();
                }
                break;

            case 'chatDone':
                isGenerating = false;
                chatHistory.push({ role: 'assistant', content: activeResponseText });
                
                // Unlock inputs
                promptInput.disabled = false;
                sendBtn.disabled = false;
                promptInput.focus();
                break;

            case 'chatError':
                isGenerating = false;
                if (activeAssistantBubble) {
                    const indicator = activeAssistantBubble.querySelector('.typing-indicator');
                    if (indicator) {
                        activeAssistantBubble.innerHTML = '';
                    }
                    activeAssistantBubble.classList.add('system');
                    activeAssistantBubble.innerText = `Error: ${message.error}`;
                } else {
                    addMessageBubble('system', `Error: ${message.error}`);
                }
                
                promptInput.disabled = false;
                sendBtn.disabled = false;
                break;

            case 'assistantMessage':
                // Direct message injected as assistant bubble (e.g. Quick Commit)
                chatWelcome.style.display = 'none';
                addMessageBubble('assistant', formatMarkdown(message.content));
                break;

            case 'chatList':
                renderChatsList(message.chats);
                break;

            case 'chatSaved':
                showToast(`✅ Chat saved: "${message.name.slice(0, 35)}"`);
                vscode.postMessage({ command: 'listChats' });
                break;

            case 'chatLoaded': {
                const loadedChat = message.chat;
                // Clear current chat
                chatHistory = [];
                activeCodeBlocks = [];
                messagesContainer.innerHTML = '';
                chatWelcome.style.display = 'none';
                // Restore model
                if (loadedChat.model) {
                    selectedModel = loadedChat.model;
                    updateStatusBar();
                }
                // Replay messages
                loadedChat.messages.forEach(m => {
                    chatHistory.push(m);
                    addMessageBubble(m.role, m.role === 'assistant' ? formatMarkdown(m.content) : escapeHtml(m.content));
                });
                showToast(`📂 Loaded: "${loadedChat.name.slice(0, 35)}"`);
                break;
            }

            case 'clearChat':
                chatHistory = [];
                activeCodeBlocks = [];
                messagesContainer.innerHTML = '';
                chatWelcome.style.display = 'flex';
                updateMainView();
                break;

            case 'focusInput':
                promptInput.focus();
                break;
        }
    });

    function updateStatusBar() {
        if (isConnected) {
            statusIndicator.className = 'status-indicator connected';
            statusDot.style.backgroundColor = '#10b981';
            statusText.innerText = 'Ollama Connected';
            modelSelectBtn.disabled = false;
            
            // Set active model name
            if (selectedModel) {
                activeModelName.innerText = selectedModel;
            } else if (localModels.length > 0) {
                selectedModel = localModels[0].name;
                activeModelName.innerText = selectedModel;
            } else {
                activeModelName.innerText = 'No Model Available';
            }
        } else {
            statusIndicator.className = 'status-indicator';
            statusDot.style.backgroundColor = '#f43f5e';
            statusText.innerText = 'Ollama Disconnected';
            modelSelectBtn.disabled = true;
            activeModelName.innerText = 'No Model Selected';
            selectedModel = '';
        }
    }

    function renderModelsDrawer() {
        modelsList.innerHTML = '';

        if (!isConnected) {
            const emptyNotice = document.createElement('div');
            emptyNotice.style.padding = '20px';
            emptyNotice.style.textAlign = 'center';
            emptyNotice.style.opacity = '0.7';
            emptyNotice.innerText = 'Ollama is disconnected. Run Ollama to manage models.';
            modelsList.appendChild(emptyNotice);
            return;
        }

        // 1. Group models
        const localNames = localModels.map(m => m.name);
        
        // Combine local models and recommended models
        const allCardData = [];
        
        // Add actual local models first
        localModels.forEach(m => {
            allCardData.push({
                id: m.name,
                name: m.name,
                sizeLabel: formatSize(m.size),
                downloaded: true
            });
        });

        // Add recommended models that are not downloaded
        recommendedModels.forEach(r => {
            // Check if match (sometimes tags differ slightly, check by simple prefix or exact match)
            const isDownloaded = localNames.some(ln => ln.split(':')[0] === r.id.split(':')[0]);
            if (!isDownloaded) {
                allCardData.push({
                    id: r.id,
                    name: r.name,
                    sizeLabel: r.sizeLabel,
                    downloaded: false
                });
            }
        });

        // Render card elements
        allCardData.forEach(model => {
            const card = document.createElement('div');
            card.className = `model-card${model.name === selectedModel ? ' active' : ''}`;
            card.id = `card-${model.id.replace(/:/g, '-')}`;

            let actionsHtml = '';
            if (model.downloaded) {
                const isActive = model.name === selectedModel;
                actionsHtml = `
                    <button class="btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'} select-btn" data-model="${model.name}" ${isActive ? 'disabled' : ''}>
                        ${isActive ? 'Active' : 'Select'}
                    </button>
                    <button class="btn btn-sm btn-danger delete-btn" data-model="${model.name}">Delete</button>
                `;
            } else {
                actionsHtml = `
                    <button class="btn btn-sm btn-primary download-btn" data-model="${model.id}">Download</button>
                `;
            }

            card.innerHTML = `
                <div class="model-card-header">
                    <span class="model-title">${model.name}</span>
                    <span class="model-size">${model.sizeLabel}</span>
                </div>
                <div class="progress-container" style="display:none;" id="progress-${model.id.replace(/:/g, '-')}">
                    <div class="progress-info">
                        <span class="progress-status">Queued</span>
                        <span class="progress-percent">0%</span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-bar"></div>
                    </div>
                </div>
                <div class="model-actions" id="actions-${model.id.replace(/:/g, '-')}">
                    ${actionsHtml}
                </div>
            `;

            // Wire actions
            if (model.downloaded) {
                card.querySelector('.select-btn')?.addEventListener('click', () => {
                    selectedModel = model.name;
                    updateStatusBar();
                    renderModelsDrawer();
                    closeDrawer();
                    updateMainView();
                });
                card.querySelector('.delete-btn')?.addEventListener('click', () => {
                    if (confirm(`Are you sure you want to delete ${model.name}?`)) {
                        vscode.postMessage({ command: 'deleteModel', model: model.name });
                    }
                });
            } else {
                card.querySelector('.download-btn')?.addEventListener('click', () => {
                    vscode.postMessage({ command: 'pullModel', model: model.id });
                    // Show progress container immediately
                    card.querySelector(`.progress-container`).style.display = 'block';
                    card.querySelector(`.model-actions`).style.display = 'none';
                });
            }

            modelsList.appendChild(card);
        });

        // Add custom pull box at bottom
        const customPullContainer = document.createElement('div');
        customPullContainer.className = 'pull-custom-container';
        customPullContainer.innerHTML = `
            <input type="text" class="pull-custom-input" id="customModelInput" placeholder="Enter custom model tag (e.g. qwen2:1.5b)">
            <button class="btn btn-sm btn-primary" id="customPullBtn">Pull</button>
        `;

        customPullContainer.querySelector('#customPullBtn').addEventListener('click', () => {
            const input = customPullContainer.querySelector('#customModelInput');
            const modelTag = input.value.trim();
            if (modelTag) {
                vscode.postMessage({ command: 'pullModel', model: modelTag });
                input.value = '';
                alert(`Started downloading ${modelTag}. Check status at top of the panel.`);
            }
        });

        modelsList.appendChild(customPullContainer);
    }

    function updatePullProgress(model, status, percent, completed, total) {
        const cleanId = model.replace(/:/g, '-');
        const card = document.getElementById(`card-${cleanId}`);
        if (!card) {
            // Custom model or card not in list, reload drawer to create card or show global status
            return;
        }

        const progContainer = card.querySelector('.progress-container');
        const actionsContainer = card.querySelector('.model-actions');
        
        progContainer.style.display = 'block';
        actionsContainer.style.display = 'none';

        const statusLabel = progContainer.querySelector('.progress-status');
        const percentLabel = progContainer.querySelector('.progress-percent');
        const bar = progContainer.querySelector('.progress-bar');

        statusLabel.innerText = status;
        percentLabel.innerText = `${percent}%`;
        bar.style.width = `${percent}%`;
        
        if (status.includes('downloading')) {
            bar.classList.add('pulse');
        } else {
            bar.classList.remove('pulse');
        }
    }

    function updatePullSuccess(model) {
        const cleanId = model.replace(/:/g, '-');
        const card = document.getElementById(`card-${cleanId}`);
        if (card) {
            const progContainer = card.querySelector('.progress-container');
            const statusLabel = progContainer.querySelector('.progress-status');
            const percentLabel = progContainer.querySelector('.progress-percent');
            const bar = progContainer.querySelector('.progress-bar');
            
            statusLabel.innerText = 'Completed!';
            percentLabel.innerText = '100%';
            bar.style.width = '100%';
            bar.classList.remove('pulse');
        }
        
        if (!selectedModel) {
            selectedModel = model;
        }
        
        checkStatus();
    }

    function updatePullError(model, errorMsg) {
        const cleanId = model.replace(/:/g, '-');
        const card = document.getElementById(`card-${cleanId}`);
        if (card) {
            const progContainer = card.querySelector('.progress-container');
            const actionsContainer = card.querySelector('.model-actions');
            
            progContainer.style.display = 'none';
            actionsContainer.style.display = 'flex';
        }
        alert(`Failed to download ${model}: ${errorMsg}`);
    }

    function updateMainView() {
        if (!isConnected) {
            setupNotice.style.display = 'block';
            quickStartNotice.style.display = 'none';
            promptInput.disabled = true;
            sendBtn.disabled = true;
            promptInput.placeholder = 'Connect Ollama to chat...';
        } else if (localModels.length === 0) {
            setupNotice.style.display = 'none';
            quickStartNotice.style.display = 'block';
            promptInput.disabled = true;
            sendBtn.disabled = true;
            promptInput.placeholder = 'Download a model to start chat...';
        } else {
            setupNotice.style.display = 'none';
            quickStartNotice.style.display = 'none';
            if (inputToolbar) inputToolbar.style.display = 'flex';
            
            if (!isGenerating) {
                promptInput.disabled = false;
                sendBtn.disabled = false;
                promptInput.placeholder = `Message ${selectedModel}...`;
            }
        }
    }

    function formatSize(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function startOllamaInstall() {
        installBtn.disabled = true;
        if (ollamaVersionSelect) ollamaVersionSelect.disabled = true;
        if (browseDirBtn) browseDirBtn.disabled = true;

        installProgressContainer.style.display = 'block';
        installProgressBar.style.width = '0%';
        installProgressBar.style.backgroundColor = 'var(--brand-primary)';
        installStatusText.innerText = 'Initializing...';

        const version = ollamaVersionSelect ? ollamaVersionSelect.value : 'latest';
        const installPath = installDirInput ? installDirInput.value : '';

        vscode.postMessage({ 
            command: 'installOllama',
            installPath: installPath,
            version: version
        });
    }

    function showInstallProgress(percent, statusText) {
        installProgressBar.style.width = `${percent}%`;
        installStatusText.innerText = statusText;
        if (percent === 100) {
            setTimeout(() => {
                installProgressContainer.style.display = 'none';
                installBtn.disabled = false;
                if (ollamaVersionSelect) ollamaVersionSelect.disabled = false;
                if (browseDirBtn) browseDirBtn.disabled = false;
            }, 3000);
        }
    }

    function showInstallError(errorMsg) {
        installStatusText.innerText = `Error: ${errorMsg}`;
        installProgressBar.style.backgroundColor = '#f43f5e';
        installBtn.disabled = false;
        if (ollamaVersionSelect) ollamaVersionSelect.disabled = false;
        if (browseDirBtn) browseDirBtn.disabled = false;
    }

    // Run
    init();
})();
