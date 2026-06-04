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
    const chatsHistoryBtn = document.getElementById('chatsHistoryBtn');
    const chatsDrawer = document.getElementById('chatsDrawer');
    const closeChatsDrawerBtn = document.getElementById('closeChatsDrawerBtn');
    const saveCurrentChatBtn = document.getElementById('saveCurrentChatBtn');
    const chatsList = document.getElementById('chatsList');

    const newChatBtn = document.getElementById('newChatBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsDrawer = document.getElementById('settingsDrawer');
    const closeSettingsDrawerBtn = document.getElementById('closeSettingsDrawerBtn');
    const settingsSystemPrompt = document.getElementById('settingsSystemPrompt');
    const settingsTemperature = document.getElementById('settingsTemperature');
    const settingsHostUrl = document.getElementById('settingsHostUrl');
    const settingsAllowCommands = document.getElementById('settingsAllowCommands');
    const settingsAllowWrite = document.getElementById('settingsAllowWrite');
    const settingsAllowRead = document.getElementById('settingsAllowRead');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const resetSettingsBtn = document.getElementById('resetSettingsBtn');

    // State
    let isConnected = false;
    let localModels = []; // Models actually downloaded in Ollama
    let selectedModel = '';
    let chatHistory = [];
    let isGenerating = false;
    let activeAssistantBubble = null;
    let activeResponseText = '';
    let activeSessionId = null; // Session ID tracking
    let appSettings = {
        systemPrompt: '',
        temperature: 0.2,
        hostUrl: 'http://127.0.0.1:11434',
        allowCommands: false,
        allowWrite: false,
        allowRead: true
    };


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

        // Settings drawer
        if (settingsBtn) settingsBtn.addEventListener('click', openSettingsDrawer);
        if (closeSettingsDrawerBtn) closeSettingsDrawerBtn.addEventListener('click', closeSettingsDrawer);
        if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);
        if (resetSettingsBtn) resetSettingsBtn.addEventListener('click', resetSettings);

        // New Chat
        if (newChatBtn) newChatBtn.addEventListener('click', startNewChat);

        // Chats drawer
        if (chatsHistoryBtn) chatsHistoryBtn.addEventListener('click', openChatsDrawer);
        if (closeChatsDrawerBtn) closeChatsDrawerBtn.addEventListener('click', closeChatsDrawer);
        if (saveCurrentChatBtn) {
            saveCurrentChatBtn.addEventListener('click', () => {
                if (chatHistory.length === 0) { showToast('Nothing to save — start a chat first.'); return; }
                vscode.postMessage({ command: 'saveChat', id: activeSessionId, name: '', model: selectedModel, messages: chatHistory });
            });
        }
        // Load chats list when drawer opens
        vscode.postMessage({ command: 'listChats' });
        
        // Fetch saved settings
        vscode.postMessage({ command: 'getSettings' });
        
        sendBtn.addEventListener('click', submitPrompt);
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitPrompt();
            }
        });

        // Event delegation for copy, insert & run buttons in code blocks and tools
        messagesContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('copy-btn')) {
                const container = e.target.closest('.code-block-container');
                const code = container.querySelector('.code-block-body .code-content').textContent;
                vscode.postMessage({ command: 'copyCode', code });
            } else if (e.target.classList.contains('insert-btn')) {
                const container = e.target.closest('.code-block-container');
                const code = container.querySelector('.code-block-body .code-content').textContent;
                vscode.postMessage({ command: 'insertCode', code });
            } else if (e.target.classList.contains('run-btn')) {
                const container = e.target.closest('.code-block-container');
                const code = container.querySelector('.code-block-body .code-content').textContent;
                vscode.postMessage({ command: 'runInTerminal', code });
            } else if (e.target.classList.contains('run-cmd-tool-btn')) {
                const card = e.target.closest('.command-card');
                const code = card.querySelector('.command-code').textContent;
                vscode.postMessage({ command: 'runInTerminal', code });
                const actionArea = card.querySelector('.tool-card-actions');
                if (actionArea) {
                    actionArea.innerHTML = `<span class="tool-status accepted">✅ Accepted</span>`;
                }
            } else if (e.target.classList.contains('write-file-tool-btn')) {
                const card = e.target.closest('.file-card');
                const path = card.getAttribute('data-path');
                const blocksJson = card.getAttribute('data-blocks');
                let content = '';
                if (blocksJson) {
                    const blocks = JSON.parse(blocksJson);
                    const finalLines = [];
                    blocks.forEach(block => {
                        if (block.type === 'unchanged') {
                            block.lines.forEach(l => finalLines.push(l.text));
                        } else if (block.type === 'edit') {
                            const cb = card.querySelector(`.hunk-checkbox[data-hunk-id="${block.id}"]`);
                            const apply = cb ? cb.checked : true;
                            block.lines.forEach(l => {
                                if (apply) {
                                    if (l.type === 'added') {
                                        finalLines.push(l.text);
                                    }
                                } else {
                                    if (l.type === 'removed') {
                                        finalLines.push(l.text);
                                    }
                                }
                            });
                        }
                    });
                    content = finalLines.join('\n');
                } else {
                    const previewCode = card.querySelector('.file-content');
                    content = previewCode ? previewCode.textContent : (card.getAttribute('data-proposed') || '');
                }
                vscode.postMessage({ command: 'writeFile', path, content });
                const actionArea = card.querySelector('.tool-card-actions');
                if (actionArea) {
                    actionArea.innerHTML = `<span class="tool-status accepted">✅ Accepted</span>`;
                }
            } else if (e.target.classList.contains('patch-file-tool-btn')) {
                const card = e.target.closest('.diff-card');
                const path = card.querySelector('.file-path').textContent;
                const search = card.querySelector('.patch-search').textContent;
                const blocksJson = card.getAttribute('data-blocks');
                let replace = '';
                if (blocksJson) {
                    const blocks = JSON.parse(blocksJson);
                    const finalReplaceLines = [];
                    blocks.forEach(block => {
                        if (block.type === 'unchanged') {
                            block.lines.forEach(l => finalReplaceLines.push(l.text));
                        } else if (block.type === 'edit') {
                            const cb = card.querySelector(`.hunk-checkbox[data-hunk-id="${block.id}"]`);
                            const apply = cb ? cb.checked : true;
                            block.lines.forEach(l => {
                                if (apply) {
                                    if (l.type === 'added') {
                                        finalReplaceLines.push(l.text);
                                    }
                                } else {
                                    if (l.type === 'removed') {
                                        finalReplaceLines.push(l.text);
                                    }
                                }
                            });
                        }
                    });
                    replace = finalReplaceLines.join('\n');
                } else {
                    replace = card.querySelector('.patch-replace').textContent;
                }
                vscode.postMessage({ command: 'patchFile', path, search, replace });
                const actionArea = card.querySelector('.tool-card-actions');
                if (actionArea) {
                    actionArea.innerHTML = `<span class="tool-status accepted">✅ Accepted</span>`;
                }
            } else if (e.target.classList.contains('refuse-tool-btn')) {
                const card = e.target.closest('.agent-tool-card');
                const actionArea = card.querySelector('.tool-card-actions');
                if (actionArea) {
                    actionArea.innerHTML = `<span class="tool-status refused">❌ Refused</span>`;
                }
            } else if (e.target.classList.contains('hunk-checkbox')) {
                const hunkContainer = e.target.closest('.diff-hunk-container');
                if (hunkContainer) {
                    if (e.target.checked) {
                        hunkContainer.classList.remove('excluded');
                    } else {
                        hunkContainer.classList.add('excluded');
                    }
                }
            } else if (e.target.classList.contains('question-opt-btn')) {
                const answer = e.target.getAttribute('data-answer');
                promptInput.value = `I select: ${answer}`;
                const siblingBtns = e.target.parentNode.querySelectorAll('.question-opt-btn');
                siblingBtns.forEach(btn => {
                    btn.disabled = true;
                    btn.style.opacity = '0.5';
                });
                e.target.style.border = '2px solid var(--brand-primary)';
                e.target.style.opacity = '1';
                submitPrompt();
            }
        });

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

    function openSettingsDrawer() {
        if (settingsDrawer) {
            settingsDrawer.style.display = 'flex';
            modelDrawer.style.display = 'none';
            if (chatsDrawer) chatsDrawer.style.display = 'none';
            vscode.postMessage({ command: 'getSettings' });
        }
    }

    function closeSettingsDrawer() {
        if (settingsDrawer) settingsDrawer.style.display = 'none';
    }

    function saveSettings() {
        if (!settingsSystemPrompt) return;
        const systemPrompt = settingsSystemPrompt.value;
        const temperature = parseFloat(settingsTemperature.value) || 0.2;
        const hostUrl = settingsHostUrl.value || 'http://127.0.0.1:11434';
        const allowCommands = settingsAllowCommands.checked;
        const allowWrite = settingsAllowWrite.checked;
        const allowRead = settingsAllowRead.checked;
        
        appSettings = { systemPrompt, temperature, hostUrl, allowCommands, allowWrite, allowRead };
        
        vscode.postMessage({
            command: 'updateSettings',
            settings: appSettings
        });
        closeSettingsDrawer();
    }

    function resetSettings() {
        const defaultPrompt = `You are the built-in AI assistant for Lucid IDE, a professional coding assistant just like Google Antigravity. You are pair programming with the user.

=== YOUR CAPABILITIES & WIDGETS ===
1. **Running Terminal Commands**:
   - To run a terminal command, output the command inside a <run_command>your command here</run_command> tag.
   - Example: <run_command>npm install</run_command>

2. **Writing Workspace Files**:
   - To create a new file or completely overwrite a file, output a <write_file path="path/to/file">content</write_file> tag.
   - Example:
     <write_file path="src/index.js">
     console.log("Hello World");
     </write_file>

3. **Modifying/Patching Files**:
   - To modify an existing file, use the <patch_file> tag with exact <search> and <replace> blocks.
   - Make sure the search block matches the target file content EXACTLY, including whitespace and indentation.
   - Example:
     <patch_file path="src/index.js">
     <search>
     console.log("Hello World");
     </search>
     <replace>
     console.log("Hello Lucid");
     </replace>
     </patch_file>

4. **Asking Multiple-Choice Questions**:
   - If you need clarification or want to offer choices, output an <ask_question> tag with options.
   - Example:
     <ask_question question="Which database would you prefer to use?">
       <option>MongoDB</option>
       <option>PostgreSQL</option>
     </ask_question>

=== RULES & GUIDELINES ===
- Act as a highly capable, autonomous developer agent. Proactively suggest file modifications, commands, and questions using these structured XML tags.
- Always use the precise XML tag syntax shown above.
- Make edits and run commands when requested. Do not just talk about them; provide the tags to execute them.

=== LIVE PROJECT CONTEXT ===
{workspaceContext}
=== END CONTEXT ===`;

        if (settingsSystemPrompt) settingsSystemPrompt.value = defaultPrompt;
        if (settingsTemperature) settingsTemperature.value = 0.2;
        if (settingsHostUrl) settingsHostUrl.value = 'http://127.0.0.1:11434';
        if (settingsAllowCommands) settingsAllowCommands.checked = false;
        if (settingsAllowWrite) settingsAllowWrite.checked = false;
        if (settingsAllowRead) settingsAllowRead.checked = true;
    }

    function startNewChat() {
        activeSessionId = null;
        chatHistory = [];
        messagesContainer.innerHTML = '';
        chatWelcome.style.display = 'flex';
        updateMainView();
        showToast('🧹 New chat session started');
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
            card.className = 'model-card chat-card';
            const date = new Date(chat.savedAt);
            const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            card.innerHTML = `
                <div class="chat-card-row">
                    <div class="chat-card-info">
                        <div class="chat-session-name" data-id="${chat.id}" title="Click to rename">${escapeHtml(chat.name)}</div>
                        <div class="chat-card-meta">${dateStr} · ${chat.model || 'Unknown'} · ${chat.messageCount} msgs</div>
                    </div>
                    <div class="chat-card-actions">
                        <button class="btn btn-sm btn-secondary load-chat-btn" data-id="${chat.id}">Load</button>
                        <button class="btn btn-sm btn-danger delete-chat-btn" data-id="${chat.id}">Delete</button>
                    </div>
                </div>
            `;
            // Click name to rename
            card.querySelector('.chat-session-name').addEventListener('click', () => {
                vscode.postMessage({ command: 'requestRenameChat', id: chat.id, name: chat.name });
            });
            card.querySelector('.load-chat-btn').addEventListener('click', () => {
                vscode.postMessage({ command: 'loadChat', id: chat.id });
                closeChatsDrawer();
            });
            card.querySelector('.delete-chat-btn').addEventListener('click', () => {
                vscode.postMessage({ command: 'requestDeleteChat', id: chat.id, name: chat.name });
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
        initializeFileCards(bubble);
        return bubble;
    }

    function scrollToBottom() {
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    function diffLines(oldLines, newLines) {
        const M = oldLines.length;
        const N = newLines.length;
        const dp = Array.from({ length: M + 1 }, () => Array(N + 1).fill(0));
        
        for (let i = 1; i <= M; i++) {
            for (let j = 1; j <= N; j++) {
                if (oldLines[i - 1] === newLines[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        
        const diff = [];
        let i = M, j = N;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
                diff.unshift({ type: 'unchanged', text: oldLines[i - 1] });
                i--;
                j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                diff.unshift({ type: 'added', text: newLines[j - 1] });
                j--;
            } else {
                diff.unshift({ type: 'removed', text: oldLines[i - 1] });
                i--;
            }
        }
        return diff;
    }

    function groupDiff(diff) {
        const blocks = [];
        let currentBlock = null;
        
        diff.forEach(item => {
            const isEdit = (item.type === 'added' || item.type === 'removed');
            
            if (currentBlock === null) {
                currentBlock = {
                    type: isEdit ? 'edit' : 'unchanged',
                    lines: [item],
                    id: 'hunk_' + Math.random().toString(36).substring(2, 9)
                };
            } else if (currentBlock.type === 'edit' && isEdit) {
                currentBlock.lines.push(item);
            } else if (currentBlock.type === 'unchanged' && !isEdit) {
                currentBlock.lines.push(item);
            } else {
                blocks.push(currentBlock);
                currentBlock = {
                    type: isEdit ? 'edit' : 'unchanged',
                    lines: [item],
                    id: 'hunk_' + Math.random().toString(36).substring(2, 9)
                };
            }
        });
        
        if (currentBlock) {
            blocks.push(currentBlock);
        }
        return blocks;
    }

    function initializeFileCards(container) {
        if (!container) return;
        const fileCards = container.querySelectorAll('.file-card:not(.initialized)');
        fileCards.forEach(card => {
            card.classList.add('initialized');
            const path = card.getAttribute('data-path');
            const cardId = card.id;
            vscode.postMessage({ command: 'getFileContent', path: path, cardId: cardId });
        });
    }

    function formatMarkdown(text) {
        let writeFileCount = 0;
        // Escape HTML tags to prevent injections, keeping double-escapes safe
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Parse ask_question tag: &lt;ask_question question=&quot;...&quot;&gt;...&lt;/ask_question&gt;
        html = html.replace(/&lt;ask_question\s+question=(?:&quot;|&#39;|"|')([^"'\n>]+?)(?:&quot;|&#39;|"|')&gt;([\s\S]*?)&lt;\/ask_question&gt;/gi, (match, question, optionsText) => {
            const options = [];
            const optionRegex = /&lt;option&gt;([\s\S]*?)&lt;\/option&gt;/gi;
            let m;
            while ((m = optionRegex.exec(optionsText)) !== null) {
                options.push(m[1].trim());
            }
            
            const optionsHtml = options.map(opt => `
                <button class="question-opt-btn" data-answer="${opt}">${opt}</button>
            `).join('');
            
            return `
                <div class="agent-tool-card question-card">
                    <div class="tool-card-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        <span>Question</span>
                    </div>
                    <div class="question-body">${question}</div>
                    <div class="question-options">
                        ${optionsHtml}
                    </div>
                </div>
            `;
        });

        // Parse run_command tag: &lt;run_command&gt;...&lt;/run_command&gt;
        html = html.replace(/&lt;run_command&gt;([\s\S]*?)&lt;\/run_command&gt;/gi, (match, cmd) => {
            const trimmedCmd = cmd.trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            
            return `
                <div class="agent-tool-card command-card">
                    <div class="tool-card-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                        <span>Execute Terminal Command</span>
                    </div>
                    <pre class="tool-code-preview"><code class="command-code">${escapeHtml(trimmedCmd)}</code></pre>
                    <div class="tool-card-actions" style="margin-top: 10px; display: flex; gap: 8px;">
                        <button class="btn btn-sm btn-success accept-tool-btn run-cmd-tool-btn">Accept</button>
                        <button class="btn btn-sm btn-danger refuse-tool-btn">Refuse</button>
                    </div>
                </div>
            `;
        });

        // Parse write_file tag: &lt;write_file path=&quot;...&quot;&gt;...&lt;/write_file&gt;
        html = html.replace(/&lt;write_file\s+path=(?:&quot;|&#39;|"|')([^"'\n>]+?)(?:&quot;|&#39;|"|')&gt;([\s\S]*?)&lt;\/write_file&gt;/gi, (match, path, content) => {
            const unescapedContent = content.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            const trimmedContent = unescapedContent.replace(/^\n+|\n+$/g, '');
            const cardId = `file_card_${path.replace(/[^a-zA-Z0-9]/g, '_')}_${writeFileCount++}`;
            
            return `
                <div class="agent-tool-card file-card" id="${cardId}" data-path="${escapeHtml(path)}" data-proposed="${escapeHtml(trimmedContent)}">
                    <div class="tool-card-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span>Write File: <strong class="file-path">${escapeHtml(path)}</strong></span>
                    </div>
                    <div class="file-diff-container">
                        <div class="diff-loading" style="padding: 10px; font-size: 11px; opacity: 0.7;">
                            Comparing with disk...
                        </div>
                    </div>
                    <div class="tool-card-actions" style="display: none; margin-top: 10px; gap: 8px;">
                        <button class="btn btn-sm btn-success accept-tool-btn write-file-tool-btn">Accept</button>
                        <button class="btn btn-sm btn-danger refuse-tool-btn">Refuse</button>
                    </div>
                </div>
            `;
        });

        // Parse patch_file tag: &lt;patch_file path=&quot;...&quot;&gt;...&lt;/patch_file&gt;
        html = html.replace(/&lt;patch_file\s+path=(?:&quot;|&#39;|"|')([^"'\n>]+?)(?:&quot;|&#39;|"|')&gt;([\s\S]*?)&lt;\/patch_file&gt;/gi, (match, path, diffBody) => {
            const searchMatch = diffBody.match(/&lt;search&gt;([\s\S]*?)&lt;\/search&gt;/i);
            const replaceMatch = diffBody.match(/&lt;replace&gt;([\s\S]*?)&lt;\/replace&gt;/i);
            
            if (!searchMatch || !replaceMatch) return match;
            
            const searchContent = searchMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            const replaceContent = replaceMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            
            // Build visual diff using LCS
            const searchLines = searchContent.split(/\r?\n/);
            const replaceLines = replaceContent.split(/\r?\n/);
            const diff = diffLines(searchLines, replaceLines);
            const blocks = groupDiff(diff);
            
            let diffViewerHtml = '';
            blocks.forEach(block => {
                if (block.type === 'unchanged') {
                    block.lines.forEach(l => {
                        diffViewerHtml += `<div class="diff-line unchanged">  ${escapeHtml(l.text)}</div>`;
                    });
                } else if (block.type === 'edit') {
                    const hasRemoved = block.lines.some(l => l.type === 'removed');
                    const hasAdded = block.lines.some(l => l.type === 'added');
                    
                    let hunkHeaderLabel = 'Modify';
                    if (!hasRemoved && hasAdded) hunkHeaderLabel = 'Insert';
                    else if (hasRemoved && !hasAdded) hunkHeaderLabel = 'Delete';
                    
                    let hunkLinesHtml = '';
                    block.lines.forEach(l => {
                        const sign = l.type === 'added' ? '+' : '-';
                        hunkLinesHtml += `<div class="diff-line ${l.type}">${sign} ${escapeHtml(l.text)}</div>`;
                    });
                    
                    diffViewerHtml += `
                        <div class="diff-hunk-container" data-hunk-id="${block.id}">
                            <div class="diff-hunk-header">
                                <div class="diff-hunk-header-left">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                    <span>${hunkHeaderLabel}</span>
                                </div>
                                <label class="diff-hunk-checkbox-label">
                                    <input type="checkbox" class="hunk-checkbox" data-hunk-id="${block.id}" checked>
                                    <span>Apply hunk</span>
                                </label>
                            </div>
                            <div class="diff-hunk-body">
                                ${hunkLinesHtml}
                            </div>
                        </div>
                    `;
                }
            });
            
            const escapedBlocksJson = escapeHtml(JSON.stringify(blocks));
            
            return `
                <div class="agent-tool-card diff-card" data-blocks="${escapedBlocksJson}">
                    <div class="tool-card-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        <span>Modify File: <strong class="file-path">${escapeHtml(path)}</strong></span>
                    </div>
                    <pre class="patch-search" style="display:none;">${escapeHtml(searchContent)}</pre>
                    <pre class="patch-replace" style="display:none;">${escapeHtml(replaceContent)}</pre>
                    <div class="diff-viewer">
                        ${diffViewerHtml}
                    </div>
                    <div class="tool-card-actions" style="margin-top: 10px; display: flex; gap: 8px;">
                        <button class="btn btn-sm btn-success accept-tool-btn patch-file-tool-btn">Accept</button>
                        <button class="btn btn-sm btn-danger refuse-tool-btn">Refuse</button>
                    </div>
                </div>
            `;
        });

        // Parse code blocks: ```lang\ncode\n```
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const trimmedCode = code.replace(/^\n+|\n+$/g, ''); // Trim leading/trailing newlines
            
            const lowerLang = (lang || '').toLowerCase();
            const terminalLangs = ['bash', 'sh', 'powershell', 'cmd', 'shell', 'zsh'];
            const terminalPrefixes = ['git', 'npm', 'yarn', 'pnpm', 'npx', 'cargo', 'pip', 'python', 'node', 'docker', 'kubectl', 'go', 'make', 'g\\+\\+', 'gcc', 'clang'];
            const isTerminal = terminalLangs.includes(lowerLang) ||
                                new RegExp('^(' + terminalPrefixes.join('|') + ')\\s', 'i').test(trimmedCode.trim());
            const runButtonHtml = isTerminal ? `<button class="code-action-btn run-btn" style="color: var(--brand-primary); font-weight: bold;">Run</button>` : '';

            return `
                <div class="code-block-container">
                    <div class="code-block-header">
                        <span class="code-block-lang">${lang || 'code'}</span>
                        <div class="code-block-actions">
                            ${runButtonHtml}
                            <button class="code-action-btn copy-btn">Copy</button>
                            <button class="code-action-btn insert-btn">Insert</button>
                        </div>
                    </div>
                    <pre class="code-block-body"><code class="code-content">${trimmedCode}</code></pre>
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
            if (p.trim().startsWith('<div class="code-block-container">') || p.trim().startsWith('<div class="agent-tool-card') || p.trim().startsWith('<ul>')) {
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
                
                if (activeAssistantBubble) {
                    initializeFileCards(activeAssistantBubble);
                }

                // Auto-save the chat session
                vscode.postMessage({
                    command: 'saveChat',
                    id: activeSessionId,
                    name: '',
                    model: selectedModel,
                    messages: chatHistory
                });

                // Autopilot execution
                if (activeAssistantBubble) {
                    if (appSettings.allowCommands) {
                        const cmdBtns = activeAssistantBubble.querySelectorAll('.run-cmd-tool-btn');
                        cmdBtns.forEach(btn => {
                            btn.click();
                        });
                    }
                    if (appSettings.allowWrite) {
                        const patchBtns = activeAssistantBubble.querySelectorAll('.patch-file-tool-btn');
                        patchBtns.forEach(btn => {
                            btn.click();
                        });
                    }
                }
                
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
                chatWelcome.style.display = 'none';
                addMessageBubble('assistant', formatMarkdown(message.content));
                break;

            case 'chatList':
                renderChatsList(message.chats);
                if (activeSessionId) {
                    const exists = message.chats.some(c => c.id === activeSessionId);
                    if (!exists) {
                        startNewChat();
                    }
                }
                break;

            case 'chatSaved':
                showToast(`✅ Saved: "${message.name.slice(0, 35)}"`);
                activeSessionId = message.id; // Store active session ID
                vscode.postMessage({ command: 'listChats' });
                break;

            case 'chatLoaded': {
                const loadedChat = message.chat;
                chatHistory = [];
                messagesContainer.innerHTML = '';
                chatWelcome.style.display = 'none';
                activeSessionId = loadedChat.id; // Store loaded session ID
                if (loadedChat.model) {
                    selectedModel = loadedChat.model;
                    updateStatusBar();
                }
                loadedChat.messages.forEach(m => {
                    chatHistory.push(m);
                    addMessageBubble(m.role, m.role === 'assistant' ? formatMarkdown(m.content) : escapeHtml(m.content));
                });
                showToast(`📂 Loaded: "${loadedChat.name.slice(0, 35)}"`);
                break;
            }

            case 'clearChat':
                chatHistory = [];
                messagesContainer.innerHTML = '';
                chatWelcome.style.display = 'flex';
                activeSessionId = null; // Clear session ID
                updateMainView();
                break;

            case 'settingsUpdate': {
                const s = message.settings;
                appSettings = s;
                if (settingsSystemPrompt) settingsSystemPrompt.value = s.systemPrompt || '';
                if (settingsTemperature) settingsTemperature.value = s.temperature !== undefined ? s.temperature : 0.2;
                if (settingsHostUrl) settingsHostUrl.value = s.hostUrl || 'http://127.0.0.1:11434';
                if (settingsAllowCommands) settingsAllowCommands.checked = !!s.allowCommands;
                if (settingsAllowWrite) settingsAllowWrite.checked = !!s.allowWrite;
                if (settingsAllowRead) settingsAllowRead.checked = !!s.allowRead;
                break;
            }

            case 'toolExecuted': {
                showToast(`🔧 Tool ${message.tool} on ${message.path}: ${message.success ? 'Success' : 'Failed'}`);
                break;
            }

            case 'fileContentResponse': {
                const { path, content, exists, cardId } = message;
                const card = document.getElementById(cardId);
                if (!card) break;
                
                const proposedContent = card.getAttribute('data-proposed') || '';
                const diffContainer = card.querySelector('.file-diff-container');
                const actions = card.querySelector('.tool-card-actions');
                
                if (exists) {
                    const currentLines = content.split(/\r?\n/);
                    const proposedLines = proposedContent.split(/\r?\n/);
                    const diff = diffLines(currentLines, proposedLines);
                    const blocks = groupDiff(diff);
                    
                    let diffViewerHtml = '';
                    blocks.forEach(block => {
                        if (block.type === 'unchanged') {
                            block.lines.forEach(l => {
                                diffViewerHtml += `<div class="diff-line unchanged">  ${escapeHtml(l.text)}</div>`;
                            });
                        } else if (block.type === 'edit') {
                            const hasRemoved = block.lines.some(l => l.type === 'removed');
                            const hasAdded = block.lines.some(l => l.type === 'added');
                            
                            let hunkHeaderLabel = 'Modify';
                            if (!hasRemoved && hasAdded) hunkHeaderLabel = 'Insert';
                            else if (hasRemoved && !hasAdded) hunkHeaderLabel = 'Delete';
                            
                            let hunkLinesHtml = '';
                            block.lines.forEach(l => {
                                const sign = l.type === 'added' ? '+' : '-';
                                hunkLinesHtml += `<div class="diff-line ${l.type}">${sign} ${escapeHtml(l.text)}</div>`;
                            });
                            
                            diffViewerHtml += `
                                <div class="diff-hunk-container" data-hunk-id="${block.id}">
                                    <div class="diff-hunk-header">
                                        <div class="diff-hunk-header-left">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                            <span>${hunkHeaderLabel}</span>
                                        </div>
                                        <label class="diff-hunk-checkbox-label">
                                            <input type="checkbox" class="hunk-checkbox" data-hunk-id="${block.id}" checked>
                                            <span>Apply hunk</span>
                                        </label>
                                    </div>
                                    <div class="diff-hunk-body">
                                        ${hunkLinesHtml}
                                    </div>
                                </div>
                            `;
                        }
                    });
                    
                    const escapedBlocksJson = escapeHtml(JSON.stringify(blocks));
                    card.setAttribute('data-blocks', escapedBlocksJson);
                    
                    diffContainer.innerHTML = `
                        <div class="diff-viewer">
                            ${diffViewerHtml}
                        </div>
                    `;
                } else {
                    diffContainer.innerHTML = `
                        <div class="new-file-notice" style="padding: 10px; font-size: 11px; font-weight: bold; color: #10b981;">🆕 New File (does not exist on disk)</div>
                        <details class="tool-details" open style="margin: 0 10px 10px 10px;">
                            <summary>Proposed File Content</summary>
                            <pre class="tool-code-preview"><code class="file-content">${escapeHtml(proposedContent)}</code></pre>
                        </details>
                    `;
                }
                
                if (actions) {
                    actions.style.display = 'flex';
                    if (appSettings.allowWrite) {
                        const acceptBtn = actions.querySelector('.write-file-tool-btn');
                        if (acceptBtn) {
                            acceptBtn.click();
                        }
                    }
                }
                break;
            }

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
                    vscode.postMessage({ command: 'requestDeleteModel', model: model.name });
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
                showToast(`Started downloading ${modelTag}...`);
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
        showToast(`Failed to download ${model}: ${errorMsg}`);
        const cleanId = model.replace(/:/g, '-');
        const card = document.getElementById(`card-${cleanId}`);
        if (card) {
            const progContainer = card.querySelector('.progress-container');
            const actionsContainer = card.querySelector('.model-actions');
            
            progContainer.style.display = 'none';
            actionsContainer.style.display = 'flex';
        }
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
