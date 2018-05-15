let express = require('express');
let app = express();
let http = require('http').Server(app);
let io = require('socket.io')(http);
let port = process.env.PORT || 3000;
const MongoClient = require("mongodb").MongoClient;
require('console-stamp')(console, 'HH:MM:ss.l'); // For debug only
const db_name = "proto";
const collection = "testlogs"
let _db;
let _local;


app.get('/', function(req, res){
  res.sendFile(__dirname + '/public/index.html');
});
// Client access to all static cpntent (public dir)
app.use(express.static(__dirname + '/public'));

io.on('connection', function(socket){
  console.log("Connected - dev")
  // Development PoC options
  // 1. Tail the oplog: get all oplogs for the collection (already existing in oplog and then tail it)
  // tailOplog(socket)
  // 2. Retrieve completed test logs from the proto db testlogs collection and emit all in one go
  // retrieveTestLog(socket)
  // 3. Retrieve completed test logs from the proto db testlogs collection then emit in sections
  retrieveTestLogParts(socket)
  // 4. Retrieve completed test logs from the proto db testlogs collection, convert to HTML DOM elements and emit
  // retrieveTestHtml(socket)
});

function tailOplog(socket) {
  console.log("Start tailing the oplog")
  // This gets all the matching entries in the complete oplog not just the new ones
  // so unsure how this will work for connections to tests already running
  // some logs in db already some updates
  // How to ensure you get all records - some inserts might already have gone from oplog
  // Start oplog tail and collect entries, get entries from db, ignore oplog entries
  // retrieved from the db, continue to scan the oplog
  _local.collection('oplog.rs', function (err, coll) {
    let stream = coll.find({"ns": db_name+"."+collection},
                           { tailable: true,
                             awaitdata: true,
                             numberOfRetries: Number.MAX_VALUE
                           }).stream();

    stream.on('data', function(val) {
      // console.log('Doc: %j',val);
      // modified from original io.emit that would broadcast to all connected clients
      socket.emit('log message', val);
      // TODO split into new messages and updates to existing
    });

    stream.on('error', function(val) {
      console.log('Error: %j', val);
    });

    stream.on('end', function(){
      console.log('End of stream');
    });
  });
}

function retrieveTestLog(socket) {
  _db.collection(collection).find().toArray(function(err, docs) {
    console.log("Found " + docs.length)
    socket.emit('saved messages', docs);
  });
}

function retrieveTestLogParts(socket) {
  console.log("Finding...")
  _db.collection(collection).find().toArray(function(err, docs) {
    console.log("Found " + docs.length);
    while (docs.length> 0) {
      // console.log(docs.splice(0, 10))
      socket.emit('saved messages', docs.splice(0, 500));
    }
    console.log("Done")
  });
}

function retrieveTestHtml(socket) {
  let foo;
  let markup;
  let logHtml = [];
  _db.collection(collection).find().toArray(function(err, docs) {
    console.log("Found " + docs.length + " logs");
    for(let i=0; i<docs.length; i++) {
      let newMsg = docs[i];
      console.log(newMsg)
      // foo = utf8.encode(newMsg.message); // do at client
      foo = newMsg.message;
      markup = `
        <div id="msg${newMsg._id}" class="containerMessage" style="background: #DDDDDD" index="msg${newMsg.index}">
          <pre id="msg${newMsg._id}content" class="None">${foo}</pre>
        </div>`;
      logHtml.push(markup);
    }
    console.log("Created HTML for " + logHtml.length + " logs")
    socket.emit('html', logHtml);
  });
}

// connect to mongoDB database
MongoClient.connect("mongodb://nz-atsmongo1,nz-atsmongo2,nz-atsmongo3/?replicaSet=replSet1", (err, database) => {
  // ... start the server
  if (err) {
    return console.log(err);
  }
  console.log("Connected to db");
  _db = database.db(db_name);
  _local = database.db("local")
  http.listen(port, function(){
    console.log('listening on *:' + port);
  });
})
