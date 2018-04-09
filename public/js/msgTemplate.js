function applyTemplate(newMsg) {
  let foo = utf8.encode(newMsg.message);
  let markup = `
    <div id="msg${newMsg._id}" class="containerMessage" style="background: #DDDDDD" index="msg${newMsg.index}">
      <p class="index" title="Message Index" style="display: flex">${newMsg.index}</p>
      <p class="timestamp" title="Timestamp" style="display: none">${newMsg.timestamp}</p>
      <span class="spacer" style="display: block;margin-left: 24px"></span>
      <span id="msg${newMsg._id}upLevel" class="triangle-topright" status="inactive" style="display:none;"></span>
      <p id="msg${newMsg._id}fold" style="display:flex;" title="Unfold higher level logs" class="containerNoFold"></p>
      <p class="logLevel" title="Log Level" style="display: flex">${newMsg.level}</p>
      <p class="levelStep" title="Step" style="display: none">${newMsg.step}</p>
      <span class="triangle-right" style="display: block"></span>
      <pre id="msg${newMsg._id}content" class="None">${foo}</pre>
      <span>&zwnj;</span>
    </div>`
  //console.log(markup);
  return markup;
}
