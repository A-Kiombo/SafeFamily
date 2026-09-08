const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Permite servir todos os arquivos estáticos (admin.html, index.html, crianca.html, etc.)
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Caminho para o arquivo de banco de dados local
const DB_FILE = path.join(__dirname, 'familias.json');

// Função para carregar o "banco de dados" do arquivo JSON (com fallback se não existir)
function carregarDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Erro ao ler o banco de dados:", error);
  }
  
  // Dados padrões caso o arquivo não exista
  return {
    "FILHO1": { id: "crianca_joao", nome: "João", responsavel: "Carlos (Pai)", codigoPais: "FILHO1" },
    "FILHO2": { id: "crianca_maria", nome: "Maria", responsavel: "Ana (Mãe)", codigoPais: "FILHO2" }
  };
}

// Função para salvar o "banco de dados" no arquivo JSON
function salvarDB(dados) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dados, null, 2), 'utf8');
  } catch (error) {
    console.error("Erro ao salvar o banco de dados:", error);
  }
}

let familiasDB = carregarDB();

// Rota para o Admin cadastrar novas crianças/famílias via API ou Painel
app.post('/api/cadastrar', (req, res) => {
  const { codigoPais, idCrianca, nomeCrianca, responsavel } = req.body;
  if (!codigoPais || !idCrianca || !nomeCrianca) {
    return res.status(400).json({ sucesso: false, mensagem: "Preencha todos os campos obrigatórios!" });
  }

  familiasDB[codigoPais.toUpperCase()] = {
    id: idCrianca,
    nome: nomeCrianca,
    responsavel: responsavel || "Responsável",
    codigoPais: codigoPais.toUpperCase()
  };

  // Salva permanentemente no arquivo
  salvarDB(familiasDB);

  console.log(`[ADMIN] Nova família cadastrada: ${nomeCrianca} (Código Pais: ${codigoPais})`);
  res.json({ sucesso: true, mensagem: "Família cadastrada com sucesso!" });
});

// Rota para o Painel Admin listar todas as crianças cadastradas
app.get('/api/familias', (req, res) => {
  res.json(familiasDB);
});

io.on('connection', (socket) => {
  console.log(`Dispositivo conectado: ${socket.id}`);

  // Validação do Painel dos Pais usando o código gerado no Admin
  socket.on('vincular_painel', (codigoConvite) => {
    // Recarrega sempre do DB para garantir dados atualizados
    familiasDB = carregarDB();
    const dados = familiasDB[codigoConvite.toUpperCase()];

    if (dados) {
      socket.join(dados.id);
      socket.emit('vinculacao_resposta', { 
        sucesso: true, 
        idCrianca: dados.id,
        nomeCrianca: dados.nome,
        mensagem: 'Painel vinculado com sucesso!' 
      });
      console.log(`[PAIS] Painel vinculado ao código: ${codigoConvite} -> Criança: ${dados.nome}`);
    } else {
      socket.emit('vinculacao_resposta', { 
        sucesso: false, 
        mensagem: 'Código de convite inválido ou não cadastrado!' 
      });
    }
  });

  // Recebe coordenadas da criança e repassa para os pais da sala
  socket.on('enviar_coordenada', (dados) => {
    const { idCrianca, latitude, longitude, timestamp } = dados;
    io.to(idCrianca).emit('atualizar_mapa', { latitude, longitude, timestamp });
  });

  // Recebe alerta de perigo / zona estranha da criança e avisa os pais na sala dela
  socket.on('enviar_alerta', (dados) => {
    const { idCrianca, mensagem, timestamp } = dados;
    console.log(`[⚠️ ALERTA DE PERIGO] Criança (${idCrianca}): ${mensagem} às ${timestamp}`);
    io.to(idCrianca).emit('alerta_recebido', { mensagem, timestamp });
  });

  // Recebe relatórios de problemas técnicos enviados pelos pais para o Administrador
  socket.on('reportar_problema', (dados) => {
    const { origem, criancaId, descricao, timestamp } = dados;
    console.log(`[🛠️ SUPORTE TÉCNICO] Origem: ${origem} | Criança ID: ${criancaId}`);
    console.log(`Descrição do problema: "${descricao}" | Horário: ${timestamp}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});