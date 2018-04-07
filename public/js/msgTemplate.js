function applyTemplate(newMsg) {
  let markup = `
    <div id="msg${newMsg.o._id}" class="containerMessage" style="background: #DDDDDD" index="msg${newMsg.o.index}">
      <p class="index" title="Message Index" style="display: flex">${newMsg.o.index}</p>
      <p class="timestamp" title="Timestamp" style="display: none">${newMsg.o.timestamp}</p>
      <span class="spacer" style="display: block;margin-left: 24px"></span>
      <span id="msg${newMsg.o._id}upLevel" class="triangle-topright" status="inactive" style="display:none;"></span>
      <p id="msg${newMsg.o._id}fold" style="display:flex;" title="Unfold higher level logs" class="containerNoFold"></p>
      <p class="logLevel" title="Log Level" style="display: flex">${newMsg.o.level}</p>
      <p class="levelStep" title="Step" style="display: none">${newMsg.o.step}</p>
      <span class="triangle-right" style="display: block"></span>
      <pre id="msg${newMsg.o._id}content" class="None">${newMsg.o.message}</pre>
      <!--p class="source" style="display: none">
        <span class="sourceText" title="Source">telnet2client.py:connect:268</span>
      </p-->
      <span>‌</span>
    </div>
  `;
  //console.log(markup);
  return markup;
}
