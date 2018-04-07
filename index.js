let express = require('express');
let app = express();
let http = require('http').Server(app);
let io = require('socket.io')(http);
let port = process.env.PORT || 3000;
const MongoClient = require("mongodb").MongoClient;
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
      console.log('Doc: %j',val);
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
});

// connect to mongoDB database
MongoClient.connect("mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rstest", (err, database) => {
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
