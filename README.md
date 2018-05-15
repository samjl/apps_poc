# Live test logging web page
Retrieves live log updates to MongoDB proto database by tailing the oplog.  

* The server connects to the ats mongo test server (run in virtual boxes on the NZ site network).
* Start the node server

  nodemon index.js
    
#### Note: nodemon
nodemon is a handy tool that lets you modify and run the server code without having to manually stop and start the server. 
