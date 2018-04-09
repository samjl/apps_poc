let allData = [];
let clusterize;

$(window).ready(function(){
  // Set the height of the scroll area
  let contentHeight = document.getElementById("content").clientHeight;
  let scrollHeight = parseInt(contentHeight / 22) * 22;
  console.log("Content height: " + contentHeight + ", scroll height set to: " + scrollHeight);
  $("#scrollArea").css('max-height', scrollHeight + 'px');

  clusterize = new Clusterize({
    scrollId: 'scrollArea',
    contentId: 'contentArea'
  });

  $(function () {
    let socket = io();
    socket.on('log message', function(msg){
      // console.log(msg)
      // Check message is a new message - just log updates to console for now
      if (msg.o.hasOwnProperty("index") && msg.o.message.charAt(0) != "{") {
        $('#main').append(applyTemplate(msg));
        newDomDiv = applyTemplate(msg);
        // console.log(newDomDiv)
        allData.push(newDomDiv);
        clusterize.update(allData);
      } else {
        // console.log(msg);
      }
      // window.scrollTo(0, document.body.scrollHeight);
    });
    socket.on('saved messages', function(docs){
      // console.log(docs.length + " messages received")
      docs.forEach(function (value) {
        // console.log(value)
        newDomDiv = applyTemplate(value);
        allData.push(newDomDiv);
      })
      clusterize.update(allData); // TODO could use .append here until the data is fully loaded?
      clusterize.refresh(true)  // refresh to update the row heights
      // refresh seems to fix the following issues:
      // not being able to scroll to bottom/flickering
      // skipping records when scrolling past cluster transitions
    });
    socket.on('html', function(html){
      clusterize.update(html);
    });
  });
});
