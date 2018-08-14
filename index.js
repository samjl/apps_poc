let express = require('express');
let app = express();
let http = require('http').Server(app);
let io = require('socket.io')(http);
let port = process.env.PORT || 3000;
const MongoClient = require('mongodb').MongoClient;
require('console-stamp')(console, 'HH:MM:ss.l'); // For debug only
const db_name = 'dev';
const collection = 'testlogs';
let _db;
let _local;


app.get('/', function(req, res){
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/session', function(req, res){
  res.sendFile(__dirname + '/public/session.html')
});

// Client access to all static content (public dir)
app.use(express.static(__dirname + '/public'));

io.on('connection', function(socket){
  let handshake = socket.handshake;
  console.log('New connection from ' + handshake.address);

  // Development PoC options
  // 1. Tail the oplog: get all oplogs for the collection (already existing in oplog and then tail it)
  // tailOplog(socket)
  // 2. Retrieve completed test logs from the proto db testlogs collection and emit all in one go
  // retrieveTestLog(socket)
  // 3. Retrieve completed test logs from the proto db testlogs collection then emit in sections
  // retrieveTestLogParts(socket)
  // 4. Retrieve completed test logs from the proto db testlogs collection, convert to HTML DOM elements and emit
  // retrieveTestHtml(socket)

  // On connect client informs server which page is loaded
  socket.on('from', function(data) {
    console.log('Client page is ' + data.page);
    switch (data.page) {
      case 'test':
        console.log('Test log page - session = ' + data.params.session + ', module = ' + data.params.module);
        retrieveTestLogParts(socket, data.params.session, data.params.module);
        break;
      case 'session':
        console.log('Session page');
        // Watch session
        break;
      default:
        console.log('Unknown page');
    }
  });
});


function tailOplog(socket) {
  console.log('Start tailing the oplog');
  // This gets all the matching entries in the complete oplog not just the new ones
  // so unsure how this will work for connections to tests already running
  // some logs in db already some updates
  // How to ensure you get all records - some inserts might already have gone from oplog
  // Start oplog tail and collect entries, get entries from db, ignore oplog entries
  // retrieved from the db, continue to scan the oplog
  _local.collection('oplog.rs', function (err, coll) {
    let stream = coll.find({'ns': db_name+'.'+collection},
                           { tailable: true,
                             awaitdata: true,
                             numberOfRetries: Number.MAX_VALUE
                           }).stream();

    stream.on('data', function(val) {
      // console.log('Doc: %j',val);
      // modified from original io.emit that would broadcast to all connected clients
      socket.emit('log message', val);
      // TODO split into new messages and updates to existing parents
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
    console.log('Found ' + docs.length);
    socket.emit('saved messages', docs);
  });
}

function retrieveTestLogParts(socket, session, module) {
  let match = {'sessionId': parseInt(session), 'moduleName': module};
  _db.collection('loglinks').find(match).toArray(function(err, links) {
    if (err) throw err;
    console.log('Found ' + links.length + ' loglink docs');
    let allLogLinks = [];
    links.forEach(function(logLink) {
      console.log('Test: ' + logLink.testName + ' - Number of log links: ' + logLink.logIds.length);
      Array.prototype.push.apply(allLogLinks, logLink.logIds);
    });
    console.log('Total logs for module: ' + allLogLinks.length);
    match = {'_id': {'$in': allLogLinks}};
    // Now retrieve the logs from the list of _id's
    _db.collection(collection).find(match).toArray(function(err, docs) {
      if (err) throw err;
      console.log('Number of log message docs retrieved: ' + docs.length);
      while (docs.length>0) {
        // Currently 500 message chunks gives the best client side performance
        socket.emit('saved messages', docs.splice(0, 500));
      }
      console.log('Done - all test logs emitted');
    });
  });
}

function retrieveTestHtml(socket) {
  let foo;
  let markup;
  let logHtml = [];
  _db.collection(collection).find().toArray(function(err, docs) {
    console.log('Found ' + docs.length + ' logs');
    for(let i=0; i<docs.length; i++) {
      let newMsg = docs[i];
      console.log(newMsg);
      // foo = utf8.encode(newMsg.message); // do at client
      foo = newMsg.message;
      markup = `
        <div id='msg${newMsg._id}' class='containerMessage' style='background: #DDDDDD' index='msg${newMsg.index}'>
          <pre id='msg${newMsg._id}content' class='None'>${foo}</pre>
        </div>`;
      logHtml.push(markup);
    }
    console.log('Created HTML for ' + logHtml.length + ' logs');
    socket.emit('html', logHtml);
  });
}

// connect to mongoDB database
MongoClient.connect('mongodb://nz-atsmongo1,nz-atsmongo2,nz-atsmongo3/?replicaSet=replSet1', (err, database) => {
  // ... start the server
  if (err) {
    return console.log(err);
  }
  console.log('Connected to db ' + db_name);
  _db = database.db(db_name);
  _local = database.db('local');
  http.listen(port, function(){
    console.log('listening on *:' + port);
  });
});
