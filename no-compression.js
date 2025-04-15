const runtimeOptions = document.getElementById("runtime_options");
const recordButton = document.createElement("button");
const statusText = document.createElement("p");
runtimeOptions.append(recordButton);
runtimeOptions.append(statusText);
recordButton.innerHTML = "record savestream";

let isRecording = false;
let dirHandle = null;
let intervalId = null;
recordButton.addEventListener("click", async () => {
  /*if already recording, stop recording*/
  if (isRecording) {
    isRecording = false;
    clearInterval(intervalId);
    recordButton.innerHTML = "record savestream";
    console.warn("stopped recording");
    console.warn("making .savestream file...");
    statusText.innerHTML = "stopped recording, making .savestream file...";

    const savestateBuffers = [];
    const entries = [];
    
    for await (const entry of dirHandle.values()) {
      if (entry.kind === "file" && entry.name.endsWith(".bin")) {
        entries.push(entry);
      }
    }
    
    entries.sort((a, b) => {
      const fileNameA = a.name;
      const fileNameB = b.name;
      const numA = parseInt(fileNameA.match(/\((\d+)\)/)[1], 10);
      const numB = parseInt(fileNameB.match(/\((\d+)\)/)[1], 10);

      return numA - numB;
    });
  
    for (let entry of entries) {
      const file = await entry.getFile();
      const buffer = await file.arrayBuffer();
      savestateBuffers.push(buffer);
    }
    
    const encodedSavestream = encodeSavestream(savestateBuffers);
    const fileName = "last.savestream";

    const fileHandle = await dirHandle.getFileHandle(fileName, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(encodedSavestream), await writable.close();
    console.warn("last.savestream saved to disk");
    statusText.innerHTML = "last.savestream saved to disk";
  } else {
    /*start recording savestream*/
    dirHandle = await window.showDirectoryPicker();
    recordButton.innerHTML = "stop recording";
    isRecording = true;
    
    console.warn("started recording");
    statusText.innerHTML = "started recording"; 

    let counter = 0;
    intervalId = setInterval(async () => {
      savestateLoop(dirHandle, ++counter);
    }, 1000);
  }
});
 