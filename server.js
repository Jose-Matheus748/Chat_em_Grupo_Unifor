// Servidor intermediário para chat com Back4App
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const Parse = require('parse/node');
const path = require('path');

// Configuração do Parse (Back4App)
Parse.initialize("O5WVfET06M45ECblDJZMwtSvjjuMXoq1cWL1QaBX", "M4Br40nahnIxdQUS0jeIoeQJ69XEhkmFK1s0YYjX", "EK734JISSd02SAY7JTollEexo2rZnAqXHAGTvSLw"); // Substitua pelos valores do seu aplicativo Back4App
Parse.serverURL = "https://parseapi.back4app.com";
Parse.CoreManager.set('USE_MASTER_KEY', true);

// Configuração do servidor Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rotas da API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor intermediário funcionando!' });
});

// Servir arquivos estáticos
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO para comunicação em tempo real
io.on('connection', (socket) => {
  console.log('Novo cliente conectado:', socket.id);
  
  // Quando um cliente entra em um grupo
  socket.on('join_group', (groupId) => {
    console.log(`Cliente ${socket.id} entrou no grupo: ${groupId}`);
    socket.join(groupId);
  });
  
  // Quando um cliente envia uma mensagem
  socket.on('send_message', async (data) => {
    console.log('Mensagem recebida:', data);
    
    try {
      // Obter o usuário pelo ID (importante para o campo sender)
      const User = Parse.Object.extend("_User");
      const userQuery = new Parse.Query(User);
      const sender = await userQuery.get(data.senderId, { useMasterKey: true });
      
      // Salvar a mensagem no Back4App
      const Message = Parse.Object.extend("Message");
      const newMessage = new Message();
      
      // Definir os campos da mensagem
      newMessage.set("text", data.text);
      newMessage.set("groupId", data.groupId);
      newMessage.set("senderName", data.senderName); //Luigi // colocando o senderName dentro dos campos que serão mandados para o back4app
      newMessage.set("sender", sender); // Usar o objeto Parse.User completo
      
      // Configurar ACL para permitir leitura e escrita pública
      const acl = new Parse.ACL();
      acl.setPublicReadAccess(true);
      acl.setPublicWriteAccess(true);
      newMessage.setACL(acl);
      
      // Salvar a mensagem usando a Master Key
      const savedMessage = await newMessage.save(null, { useMasterKey: true });
      console.log("Mensagem salva no Back4App:", savedMessage.id);
      
      // Atualizar o grupo (última mensagem e participantes)
      const Group = Parse.Object.extend("Group");
      const groupQuery = new Parse.Query(Group);
      
      try {
        const group = await groupQuery.get(data.groupId, { useMasterKey: true });
        
        // Atualizar data de atualização
        group.set("updatedAt", new Date());
        
        // Garantir que o remetente está nos participantes
        let participants = group.get("participants") || [];
        if (!participants.includes(data.senderId)) {
          participants.push(data.senderId);
          group.set("participants", participants);
        }
        
        await group.save(null, { useMasterKey: true });
      } catch (groupError) {
        console.error("Erro ao atualizar grupo:", groupError);
        // Continuar mesmo se houver erro ao atualizar o grupo
      }
      
      // Enviar a mensagem para todos os clientes no grupo
      const messageToSend = {
        id: savedMessage.id,
        text: data.text,
        groupId: data.groupId,
        sender: {
          id: data.senderId,
          username: data.senderName
        },
        createdAt: savedMessage.createdAt
      };
      
      io.to(data.groupId).emit('new_message', messageToSend);
      
    } catch (error) {
      console.error("Erro ao processar mensagem:", error);
      // Notificar o cliente sobre o erro
      socket.emit('error', { message: "Erro ao enviar mensagem: " + error.message });
    }
  });
  
  // Quando um cliente cria um grupo
  socket.on('create_group', async (data) => {
    console.log('Novo grupo:', data);
    
    try {
      // Obter o usuário pelo ID (importante para o campo createdBy)
      const User = Parse.Object.extend("_User");
      const userQuery = new Parse.Query(User);
      const creator = await userQuery.get(data.creatorId, { useMasterKey: true });
      
      // Salvar o grupo no Back4App
      const Group = Parse.Object.extend("Group");
      const newGroup = new Group();
      
      // Definir os campos do grupo
      newGroup.set("name", data.name);
      newGroup.set("description", data.description || "");
      newGroup.set("createdBy", creator); // Usar o objeto Parse.User completo
      newGroup.set("participants", [data.creatorId]);
      
      // Configurar ACL para permitir leitura e escrita pública
      const acl = new Parse.ACL();
      acl.setPublicReadAccess(true);
      acl.setPublicWriteAccess(true);
      newGroup.setACL(acl);
      
      // Salvar o grupo usando a Master Key
      const savedGroup = await newGroup.save(null, { useMasterKey: true });
      console.log("Grupo salvo no Back4App:", savedGroup.id);
      
      // Enviar o grupo para todos os clientes
      const groupToSend = {
        id: savedGroup.id,
        name: data.name,
        description: data.description || "",
        createdBy: {
          id: data.creatorId,
          username: data.creatorName
        },
        participants: [data.creatorId],
        createdAt: savedGroup.createdAt,
        updatedAt: savedGroup.updatedAt
      };
      
      io.emit('new_group', groupToSend);
      
    } catch (error) {
      console.error("Erro detalhado ao criar grupo:", error);
      socket.emit('error', { message: "Erro ao criar grupo: " + error.message });
    }
  });
  
  // Quando um cliente se desconecta
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
