/* globals h, MessagePack */

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
}

(async function () {
  await loadScript(
    "https://cdn.jsdelivr.net/npm/@msgpack/msgpack@3.1.1/dist.umd/msgpack.min.js"
  );

  if (!window.msgpack && !window.MessagePack) {
    throw new Error("msgpack not loaded correctly");
  }
})();

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

function unpack(fileContent) {
  const blockStart = 16;
  const infoLenIndex = 3;

  let header = fileContent.slice(0, blockStart);

  let headerDV = new DataView(header);
  let infoLen = headerDV.getInt32(infoLenIndex * 4, true);

  let infoSegment = fileContent.slice(blockStart, blockStart + infoLen);

  let bufferOffset = blockStart + infoLen;
  bufferOffset = (bufferOffset + 3) & ~3;

  let bufferSegment = fileContent.slice(bufferOffset);

  return { header, infoSegment, bufferSegment };
}

function align(infoSegment, bufferSegment, blockSize) {
  let info = JSON.parse(new TextDecoder("utf-8").decode(infoSegment));

  let alignedBlocks = [];
  for (let bufferInfo of info.buffer_infos) {
    let offset = bufferInfo.offset;
    let length = bufferInfo.length;

    let paddingLength = (blockSize - (length % blockSize)) % blockSize;

    let rawBlock = new Uint8Array(bufferSegment, offset, length);
    let expandedBlock = new Uint8Array(length + paddingLength);
    expandedBlock.set(rawBlock);

    alignedBlocks.push(expandedBlock);
  }

  let totalSize = alignedBlocks.reduce((sum, block) => sum + block.length, 0);
  let alignedBuffer = new Uint8Array(totalSize);

  let offset = 0;
  for (let block of alignedBlocks) {
    alignedBuffer.set(block, offset);
    offset += block.length;
  }

  return alignedBuffer.buffer;
}

function deduplicate(alignedBuffer, uniqueBlockIds, blockSize) {
  const decoder = new TextDecoder();
  const blockCount = Math.floor(alignedBuffer.byteLength / blockSize);

  const newBlocks = new Map();
  const blockSequence = [];

  for (let i = 0; i < blockCount; i++) {
    const offset = i * blockSize;
    const block = new Uint8Array(alignedBuffer, offset, blockSize);

    const blockKey = decoder.decode(block);
    if (!uniqueBlockIds.has(blockKey)) {
      const id = uniqueBlockIds.size;
      uniqueBlockIds.set(blockKey, id);
      newBlocks.set(id, block.slice());
    }
    blockSequence.push(uniqueBlockIds.get(blockKey));
  }

  return { newBlocks, blockSequence };
}

function encodeSavestream(savestateBuffers) {
  const frames = [];
  const uniqueBlockIds = new Map();
  let runButton = document.getElementById("run");
  runButton.click();

  for (let [index, buffer] of savestateBuffers.entries()) {
    const { header, infoSegment, bufferSegment } = unpack(buffer);
    const blockSize = 256;
    const alignedBufferSegment = align(infoSegment, bufferSegment, blockSize);
    const { newBlocks, blockSequence } = deduplicate(
      alignedBufferSegment,
      uniqueBlockIds,
      blockSize
    );

    const frame = {
      header: new Uint8Array(header),
      infoSegment: new Uint8Array(infoSegment),
      blockSize,
      newBlocks: Object.fromEntries(newBlocks),
      blockSequence,
    };

    frames.push(frame);

    console.warn("frames done out of", savestateBuffers.length);
    statusText.innerHTML = `${index + 1} frames done out of ${savestateBuffers.length}`;
  }

  runButton.click();
  return MessagePack.encode(frames);
}

/*Function to check and generate unique file name*/
async function getUniqueFileHandle(dirHandle, baseFileName) {
  let fileName = baseFileName;
  let counter = 1;

  while (true) {
    try {
      /*try to get the file handle*/
      const fileHandle = await dirHandle.getFileHandle(fileName, {
        create: false,
      });
      /*If the file exists, increment the counter and try again*/
      fileName = baseFileName.replace(".msgpack", ` (${counter}).msgpack`);
      counter++;
    } catch (err) {
      /*If the file doesn't exist, create the file handle*/
      return dirHandle.getFileHandle(fileName, { create: true });
    }
  }
}

async function savestateLoop(dirHandle, counter) {
  let savestate = h.Ia.Vf();
  const blob = new Blob([savestate], {
    type: "application/octet-stream",
  });

  const timestamp = new Date().getTime();
  const fileName = `v86state (${timestamp}).bin`;

  const fileHandle = await dirHandle.getFileHandle(fileName, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(blob), await writable.close();

  console.warn("state saved");
  statusText.innerHTML = `${counter} states saved`;
}