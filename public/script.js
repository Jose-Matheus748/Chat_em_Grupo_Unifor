// Inicialização do Parse
Parse.initialize("O5WVfET06M45ECblDJZMwtSvjjuMXoq1cWL1QaBX", "M4Br40nahnIxdQUS0jeIoeQJ69XEhkmFK1s0YYjX"); // Substitua pelos valores do seu aplicativo Back4App
Parse.serverURL = "https://parseapi.back4app.com";

// Inicialização do Socket.IO
const socket = io();

document.addEventListener('DOMContentLoaded', function () {
    // Elementos do DOM
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const messagesContainer = document.getElementById('area_msg');
    const chatList = document.getElementById('chat-list');
    const chatSelect = document.getElementById('chat_select');
    const tituloGrupo = document.getElementById('titulo_grupo');
    const participantesGrupo = document.getElementById('participantes_grupo');
    const searchGroups = document.getElementById('searchGroups');
    const btnAddGroup = document.getElementById('btnAddGroup');
    const createGroupBtn = document.getElementById('createGroupBtn');
    const connectionStatus = document.getElementById('connectionStatus');
    const telaVazia =`
                <div class="empty-state">
                    <i class="bi bi-chat-dots"></i>
                    <p>Nenhuma mensagem ainda. Seja o primeiro a enviar!</p>
                </div>
            `;
    var telaInicial = false;
    const telaComum = `
            <div class="empty-state">
                    <i></i>
                    <p></p>
                </div>
            `

    function inserirTelaGrupoInicial(telaVazia) {
        telaInicial = true;
        messagesContainer.innerHTML = telaVazia;
    }
    function inserirTelaGrupoComum(telaComum) {
        telaInicial = false;
        messagesContainer.innerHTML = telaComum;
    }

    // Modais
    const newGroupModal = new bootstrap.Modal(document.getElementById('newGroupModal'));
    const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
    
    // Variáveis globais
    let currentUser = null;
    let currentGroupId = null;
    let groups = [];
    
    // Verificar se o usuário está logado
    checkCurrentUser();
    
    // Função para verificar o usuário atual
    function checkCurrentUser() {
        currentUser = Parse.User.current();
        if (!currentUser) {
            loginModal.show();
        } else {
            console.log("Usuário logado:", currentUser.get("username"));
            // Carregar grupos
            loadGroups();
        }
    }
    
    // Função para garantir que um valor seja um objeto Date válido
    function ensureDate(dateValue) {
        if (!dateValue) {
            return new Date();
        }
        
        if (dateValue instanceof Date) {
            return dateValue;
        }
        
        // Se for string ou número, converter para Date
        try {
            return new Date(dateValue);
        } catch (e) {
            console.error("Erro ao converter para Date:", e);
            return new Date();
        }
    }
    
    // Função para carregar grupos
    function loadGroups() {
        showLoading("Carregando grupos...");
        
        const Group = Parse.Object.extend("Group");
        const query = new Parse.Query(Group);
        
        // Carregar todos os grupos sem filtrar por participante
        query.addAscending("updatedAt");
        
        query.find().then((results) => {
            console.log("Grupos carregados:", results.length);
            groups = results;
            renderGroups(groups);
            hideLoading();
        }).catch((error) => {
            console.error("Erro ao carregar grupos:", error);
            showError("Erro ao carregar grupos. Tente novamente.");
            hideLoading();
            
            // Tentar carregar do cache local
            const cachedGroups = loadFromCache('groups');
            if (cachedGroups && cachedGroups.length > 0) {
                console.log("Carregando grupos do cache local");
                renderGroups(cachedGroups);
            } else {
                // Se não houver grupos no cache, criar um grupo padrão
                createDefaultGroup();
            }
        });
    }
    
    // Função para criar um grupo padrão se não houver grupos
    function createDefaultGroup() {
        const Group = Parse.Object.extend("Group");
        const defaultGroup = new Group();
        
        defaultGroup.set("name", "Grupo Geral");
        defaultGroup.set("description", "Grupo padrão para todos os usuários");
        defaultGroup.set("createdBy", currentUser);
        defaultGroup.set("participants", [currentUser.id]);
        
        // Configurar ACL para o grupo
        const acl = new Parse.ACL();
        acl.setPublicReadAccess(true);
        acl.setPublicWriteAccess(true);
        defaultGroup.setACL(acl);
        
        defaultGroup.save().then((group) => {
            console.log("Grupo padrão criado com sucesso:", group);
            groups = [group];
            renderGroups(groups);
        }).catch((error) => {
            console.error("Erro ao criar grupo padrão:", error);
        });
    }
    
    // Função para renderizar a lista de grupos
    function renderGroups(groupsList) {
        // Limpar a lista de grupos (mantendo o input hidden)
        while (chatList.firstChild) {
            if (chatList.firstChild.id === 'chat_select') {
                const temp = chatList.firstChild;
                chatList.innerHTML = '';
                chatList.appendChild(temp);
                break;
            }
            chatList.removeChild(chatList.firstChild);
        }
        
        if (groupsList.length === 0) {
            const noGroupsDiv = document.createElement('div');
            noGroupsDiv.className = 'p-3 text-center text-muted';
            noGroupsDiv.textContent = 'Nenhum grupo encontrado. Crie um novo grupo!';
            chatList.appendChild(noGroupsDiv);
            return;
        }
        
        // Salvar no cache local
        saveToCache('groups', groupsList);
        
        groupsList.forEach((group, index) => {
            const chatItem = document.createElement('div');
            chatItem.className = `chat-item ${currentGroupId === group.id ? 'active' : ''}`;
            chatItem.dataset.id = group.id;
            
            // Obter a última mensagem do grupo
            const lastMessage = getLastMessageFromCache(group.id);
            if (lastMessage) {
                renderGroupItem(chatItem, group, lastMessage);
            } else {
                const Message = Parse.Object.extend("Message");
                const query = new Parse.Query(Message);
                query.equalTo("groupId", group.id);
                query.descending("createdAt");
                query.limit(1);
                
                query.find().then((messages) => {
                    let lastMessageText = "Nenhuma mensagem ainda";
                    if (messages.length > 0) {
                        const lastMessage = messages[0];
                        lastMessageText = lastMessage.get("text");
                        if (lastMessageText.length > 30) {
                            lastMessageText = lastMessageText.substring(0, 30) + "...";
                        }
                        // Salvar no cache
                        saveLastMessageToCache(group.id, {
                            text: lastMessage.get("text"),
                            sender: lastMessage.get("sender").id,
                            timestamp: lastMessage.get("createdAt")
                        });
                    }
                    
                    renderGroupItem(chatItem, group, { text: lastMessageText });
                }).catch((error) => {
                    console.error("Erro ao carregar última mensagem:", error);
                    renderGroupItem(chatItem, group, { text: "Erro ao carregar mensagem" });
                });
            }
            
            chatItem.addEventListener("click", () => {
                // Remove a classe active de todos os itens
                document.querySelectorAll('.chat-item').forEach(item => {
                    item.classList.remove('active');
                });
                
                // Adiciona a classe active apenas ao item clicado
                chatItem.classList.add('active');
                
                // Atualiza o grupo atual e carrega as mensagens
                currentGroupId = group.id;
                chatSelect.value = group.id;
                tituloGrupo.textContent = group.get("name");
                
                // Atualizar número de participantes
                const participantsCount = group.get("participants") ? group.get("participants").length : 0;
                participantesGrupo.textContent = `${participantsCount} participantes`;
                
                // Adicionar o usuário atual aos participantes se ainda não estiver
                addCurrentUserToGroup(group);
                
                // Carregar mensagens do grupo
                loadMessages(group.id);
                
                // Entrar no grupo via Socket.IO
                socket.emit('join_group', group.id);
            });
            
            chatList.appendChild(chatItem);
            
            // Se for o primeiro grupo e nenhum grupo estiver selecionado, selecione-o
            if (index === 0 && !currentGroupId) {
                chatItem.click();
            }
        });
    }
    
    // Função para adicionar o usuário atual ao grupo se ainda não estiver
    function addCurrentUserToGroup(group) {
        const participants = group.get("participants") || [];
        if (!participants.includes(currentUser.id)) {
            participants.push(currentUser.id);
            group.set("participants", participants);
            
            group.save().then(() => {
                console.log("Usuário adicionado ao grupo");
            }).catch((error) => {
                console.error("Erro ao adicionar usuário ao grupo:", error);
            });
        }
    }
    
    function renderGroupItem(chatItem, group, lastMessage) {
        let updatedAt;
        
        // Verificar se o grupo é do Parse ou do cache
        if (group.get) {
            updatedAt = ensureDate(group.get("updatedAt"));
        } else {
            updatedAt = ensureDate(group.updatedAt);
        }
        
        chatItem.innerHTML = `
            <div class="d-flex justify-content-between">
                <h6 class="mb-1">${group.get ? group.get("name") : group.name}</h6>
                <small class="text-muted">${formatDate(updatedAt)}</small>
            </div>
            <p class="mb-1 text-muted small" id="chat_${group.id || group.objectId}">${lastMessage.text}</p>
        `;
    }
    
    // Função para carregar mensagens de um grupo
    function loadMessages(groupId) {
        showLoading("Carregando mensagens...");
        
        // Verificar se há mensagens no cache
        const cachedMessages = getMessagesFromCache(groupId);
        if (cachedMessages && cachedMessages.length > 0) {
            console.log("Carregando mensagens do cache:", cachedMessages.length);
            renderMessages(cachedMessages);
        }
        
        const Message = Parse.Object.extend("Message");
        const query = new Parse.Query(Message);
        query.equalTo("groupId", groupId);
        query.include("sender");  // Importante: incluir o objeto sender
        query.ascending("createdAt");
        query.limit(100); // Limitar para as 100 mensagens mais recentes
        
        query.find().then((messages) => {
            console.log("Mensagens carregadas do Back4App:", messages.length);
            
            // Salvar no cache local com informações completas do remetente
            const messagesToCache = messages.map(msg => {
                const sender = msg.get("sender");
                return {
                    id: msg.id,
                    text: msg.get("text"),
                    groupId: msg.get("groupId"),
                    sender: {
                        id: sender ? sender.id : "unknown",
                        username: sender ? sender.get("username") : "Usuário desconhecido"
                    },
                    createdAt: msg.get("createdAt")
                };
            });
            
            saveMessagesToCache(groupId, messagesToCache);
            renderMessages(messages);
            hideLoading();
        }).catch((error) => {
            console.error("Erro ao carregar mensagens:", error);
            
            // Se já temos mensagens do cache, não mostrar erro
            if (!cachedMessages || cachedMessages.length === 0) {
                showError("Erro ao carregar mensagens. Tente novamente.");
            }
            
            hideLoading();
        });
    }
    
    function renderMessages(messages) {
        console.log(messages);
        messagesContainer.innerHTML = '';
        
        //Grupo criado
        if (messages.length === 0 || telaInicial) {
            inserirTelaGrupoInicial(telaVazia);
            return;
        }
        
        let lastDate = null;
        
        //enviar mensagem
        messages.forEach((message) => {
            // Garantir que messageDate seja um objeto Date válido
            let messageDate;
            if (message.get) {
                messageDate = ensureDate(message.get("createdAt"));
            } else {
                messageDate = ensureDate(message.createdAt);
            }
            
            const formattedDate = formatDateFull(messageDate);
            
            // Adicionar divisor de data se for um novo dia
            if (!lastDate || !isSameDay(lastDate, messageDate)) {
                const dateDivider = document.createElement('div');
                dateDivider.className = 'date-divider';
                dateDivider.innerHTML = `<span>${formattedDate}</span>`;
                messagesContainer.appendChild(dateDivider);
                lastDate = messageDate;
            }
            
            // Obter informações do remetente
            let senderId, senderName;
            
            // Verificar se a mensagem é do Parse ou do cache
            if (message.get) {
                // Mensagem do Parse
                const sender = message.get("sender");
                if (sender) {
                    senderId = sender.id;
                    senderName = sender.get("username");
                } else {
                    senderId = "unknown";
                    senderName = "Usuário desconhecido";
                }
            } else {
                // Mensagem do cache
                if (message.sender) {
                    senderId = message.sender.id;
                    senderName = message.sender.username;
                } else {
                    senderId = "unknown";
                    senderName = "Usuário desconhecido";
                }
            }
            
            // Determinar se a mensagem foi enviada pelo usuário atual
            const isSent = senderId === currentUser.id;
            
            // Obter o texto da mensagem
            const text = message.text || message.get("text");
            
            // Adicionar a mensagem à UI
            addMessageToUI(text, isSent, senderName, formatTime(messageDate));
        });
        
        // Rolar para a última mensagem
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    // Função para adicionar mensagem à UI
    function addMessageToUI(content, isSent, senderName, time) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
        
        if(telaInicial){
            //trocar a tela caso o grupo esteja na tela inicial 
            inserirTelaGrupoComum(telaComum);
        }

        let messageHTML = '';
        
        // Se for mensagem recebida, adicionar nome do remetente
        if (!isSent) {
            messageHTML += `<div class="sender-name">${senderName}</div>`;
        }
        
        messageHTML += `
            <p class="mb-1">${content}</p>
            <div class="message-time">
                ${time} ${isSent ? '<i class="bi bi-check2-all"></i>' : ''}
            </div>
        `;
        
        messageDiv.innerHTML = messageHTML;
        messagesContainer.appendChild(messageDiv);
    }
    
    // Função para enviar mensagem
    function sendMessage() {
        const message = messageInput.value.trim();
        if (!message || !currentGroupId) return;
        
        // Adicionar a mensagem localmente primeiro para feedback imediato
        addMessageToUI(message, true, currentUser.get("username"), formatTime(new Date()));
        
        // Limpar o campo de entrada
        messageInput.value = '';
        
        // Rolar para a última mensagem
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Enviar a mensagem via Socket.IO
        socket.emit('send_message', {
            text: message,
            groupId: currentGroupId,
            senderId: currentUser.id,
            senderName: currentUser.get("username")
        });
        
        // Adicionar ao cache local
        const messageObj = {
            id: `temp_${Date.now()}`,
            text: message,
            groupId: currentGroupId,
            sender: {
                id: currentUser.id,
                username: currentUser.get("username")
            },
            createdAt: new Date()
        };
        
        // Atualizar cache de mensagens
        const existingMessages = getMessagesFromCache(currentGroupId) || [];
        existingMessages.push(messageObj);
        saveMessagesToCache(currentGroupId, existingMessages);
        
        // Atualizar cache da última mensagem
        saveLastMessageToCache(currentGroupId, {
            text: message,
            sender: currentUser.id,
            timestamp: new Date()
        });
    }
    
    // Função para criar um novo grupo
    function createGroup() {
        const groupName = document.getElementById('groupName').value.trim();
        const groupDescription = document.getElementById('groupDescription').value.trim();
        
        if (!groupName) {
            alert("Por favor, insira um nome para o grupo.");
            return;
        }
        
        console.log("Enviando solicitação para criar grupo:", {
            name: groupName,
            description: groupDescription,
            creatorId: currentUser.id,
            creatorName: currentUser.get("username")
        });
        
        // Enviar solicitação de criação de grupo via Socket.IO
        socket.emit('create_group', {
            name: groupName,
            description: groupDescription,
            creatorId: currentUser.id,
            creatorName: currentUser.get("username")
        });
        
        // Limpar campos do modal
        document.getElementById('groupName').value = '';
        document.getElementById('groupDescription').value = '';
        newGroupModal.hide();
    }
    
    // Função para login
    function login() {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        
        if (!username || !password) {
            alert("Por favor, preencha todos os campos.");
            return;
        }
        
        showLoading("Fazendo login...");
        
        Parse.User.logIn(username, password).then((user) => {
            console.log("Login bem-sucedido:", user);
            currentUser = user;
            loginModal.hide();
            
            // Carregar grupos
            loadGroups();
            hideLoading();
        }).catch((error) => {
            console.error("Erro ao fazer login:", error);
            showError("Erro ao fazer login. Verifique suas credenciais.");
            hideLoading();
            
            // Tentar registrar automaticamente se o login falhar
            registerNewUser(username, password);
        });
    }
    
    // Função para tentar registrar automaticamente
    function registerNewUser(username, password) {
        showLoading("Criando nova conta...");
        
        const user = new Parse.User();
        user.set("username", username);
        user.set("password", password);
        
        user.signUp().then((user) => {
            console.log("Registro automático bem-sucedido:", user);
            currentUser = user;
            loginModal.hide();
            
            // Carregar grupos
            loadGroups();
            hideLoading();
        }).catch((error) => {
            console.error("Erro ao registrar automaticamente:", error);
            hideLoading();
        });
    }
    
    // Função para registro
    function register() {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        
        if (!username || !password) {
            alert("Por favor, preencha todos os campos.");
            return;
        }
        
        showLoading("Criando conta...");
        
        const user = new Parse.User();
        user.set("username", username);
        user.set("password", password);
        
        user.signUp().then((user) => {
            console.log("Registro bem-sucedido:", user);
            currentUser = user;
            loginModal.hide();
            
            // Carregar grupos
            loadGroups();
            hideLoading();
        }).catch((error) => {
            console.error("Erro ao registrar:", error);
            showError("Erro ao registrar. Tente outro nome de usuário.");
            hideLoading();
        });
    }
    
    // Função para pesquisar grupos
    function searchGroupsFunction() {
        const searchTerm = searchGroups.value.toLowerCase();
        
        if (!searchTerm) {
            renderGroups(groups);
            return;
        }
        
        const filteredGroups = groups.filter(group => {
            const name = group.get ? group.get("name") : group.name;
            const description = group.get ? group.get("description") : group.description;
            
            return name.toLowerCase().includes(searchTerm) || 
                  (description && description.toLowerCase().includes(searchTerm));
        });
        
        renderGroups(filteredGroups);
    }
    
    // Funções de cache local
    function saveToCache(key, data) {
        try {
            localStorage.setItem(`chat_${key}`, JSON.stringify(data));
        } catch (e) {
            console.error("Erro ao salvar no cache:", e);
        }
    }
    
    function loadFromCache(key) {
        try {
            const data = localStorage.getItem(`chat_${key}`);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error("Erro ao carregar do cache:", e);
            return null;
        }
    }
    
    function saveMessagesToCache(groupId, messages) {
        try {
            localStorage.setItem(`chat_messages_${groupId}`, JSON.stringify(messages));
        } catch (e) {
            console.error("Erro ao salvar mensagens no cache:", e);
        }
    }
    
    function getMessagesFromCache(groupId) {
        try {
            const data = localStorage.getItem(`chat_messages_${groupId}`);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error("Erro ao carregar mensagens do cache:", e);
            return null;
        }
    }
    
    function saveLastMessageToCache(groupId, message) {
        try {
            localStorage.setItem(`chat_lastmsg_${groupId}`, JSON.stringify(message));
        } catch (e) {
            console.error("Erro ao salvar última mensagem no cache:", e);
        }
    }
    
    function getLastMessageFromCache(groupId) {
        try {
            const data = localStorage.getItem(`chat_lastmsg_${groupId}`);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error("Erro ao carregar última mensagem do cache:", e);
            return null;
        }
    }
    
    // Funções de UI
    function showLoading(message) {
        // Implementar indicador de carregamento se necessário
        console.log(message);
    }
    
    function hideLoading() {
        // Remover indicador de carregamento
    }
    
    function showError(message) {
        // Mostrar mensagem de erro
        console.error(message);
        alert(message);
    }
    
    // Funções auxiliares para formatação de data e hora
    function formatTime(date) {
        // Garantir que date seja um objeto Date válido
        date = ensureDate(date);
        return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    
    function formatDate(date) {
        // Garantir que date seja um objeto Date válido
        date = ensureDate(date);
        
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (isSameDay(date, today)) {
            return "Hoje";
        } else if (isSameDay(date, yesterday)) {
            return "Ontem";
        } else {
            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
        }
    }
    
    function formatDateFull(date) {
        // Garantir que date seja um objeto Date válido
        date = ensureDate(date);
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    }
    
    function isSameDay(date1, date2) {
        // Garantir que ambas as datas sejam objetos Date válidos
        date1 = ensureDate(date1);
        date2 = ensureDate(date2);
        
        return date1.getDate() === date2.getDate() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getFullYear() === date2.getFullYear();
    }
    
    // Event Listeners
    sendButton.addEventListener('click', sendMessage);
    
    messageInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    btnAddGroup.addEventListener('click', function() {
        newGroupModal.show();
    });
    
    createGroupBtn.addEventListener('click', createGroup);
    
    document.getElementById('loginBtn').addEventListener('click', login);
    
    document.getElementById('registerBtn').addEventListener('click', register);
    
    searchGroups.addEventListener('input', searchGroupsFunction);
    
    // Socket.IO Event Listeners
    
    // Quando receber uma nova mensagem
    socket.on('new_message', function(message) {
        console.log('Nova mensagem recebida:', message);
        
        if (message.groupId === currentGroupId) {
            const isSent = message.sender.id === currentUser.id;
            
            // Evitar duplicação de mensagens (já que adicionamos localmente)
            if (!isSent) {
                addMessageToUI(message.text, false, message.sender.username, formatTime(new Date(message.createdAt)));
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
            
            // Atualizar cache de mensagens
            const existingMessages = getMessagesFromCache(currentGroupId) || [];
            existingMessages.push(message);
            saveMessagesToCache(currentGroupId, existingMessages);
            
            // Atualizar cache da última mensagem
            saveLastMessageToCache(currentGroupId, {
                text: message.text,
                sender: message.sender.id,
                timestamp: message.createdAt
            });
        }
        
        // Atualizar a última mensagem na lista de grupos
        updateLastMessageInGroupList(message.groupId, message);
    });
    
    // Quando um novo grupo for criado
    socket.on('new_group', function(group) {
        console.log('Novo grupo recebido:', group);
        
        // Recarregar grupos
        loadGroups();
    });
    
    // Quando ocorrer um erro
    socket.on('error', function(error) {
        console.error('Erro recebido do servidor:', error);
        showError(error.message);
    });
    
    // Atualizar a última mensagem na lista de grupos
    function updateLastMessageInGroupList(groupId, message) {
        const chatItem = document.querySelector(`.chat-item[data-id="${groupId}"]`);
        if (chatItem) {
            const lastMessageElement = chatItem.querySelector(`#chat_${groupId}`);
            if (lastMessageElement) {
                let messageText = message.text;
                if (messageText.length > 30) {
                    messageText = messageText.substring(0, 30) + "...";
                }
                lastMessageElement.textContent = messageText;
            }
        }
    }
    
    // Monitorar estado da conexão Socket.IO
    socket.on('connect', function() {
        connectionStatus.innerHTML = '<span class="badge bg-success">Conectado</span>';
    });
    
    socket.on('disconnect', function() {
        connectionStatus.innerHTML = '<span class="badge bg-danger">Desconectado</span>';
    });
    
    socket.on('connect_error', function() {
        connectionStatus.innerHTML = '<span class="badge bg-warning">Erro de conexão</span>';
    });
});
