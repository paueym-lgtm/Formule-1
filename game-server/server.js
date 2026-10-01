const http = require("http");
const WebSocket = require("ws");

const port = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Paulogames server OK");
});

const wss = new WebSocket.Server({
  server,
  path: "/ws"
});

wss.on("connection", (ws) => {
  console.log("Un joueur vient de se connecter.");

  ws.send(JSON.stringify({
    type: "welcome",
    message: "Connexion au serveur Paulogames réussie !"
  }));

  ws.on("message", (message) => {
    console.log("Message reçu :", message.toString());
  });

  ws.on("close", () => {
    console.log("Joueur déconnecté.");
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Paulogames server lancé sur le port ${port}`);
});
