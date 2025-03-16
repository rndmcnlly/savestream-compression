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
runtimeOptions.append(recordButton);
recordButton.innerHTML = "record savestream";

let isRecording = false;
let dirHandle = null;
let intervalId = null;
recordButton.addEventListener("click", async () => {
  // if already recording, stop recording
  if (isRecording) {
    isRecording = false;
    clearInterval(intervalId);
    recordButton.innerHTML = "record savestream";
    console.warn("stopped recording");
    console.warn("making .savestream file...");

    const savestateBuffers = [];

    for await (const entry of dirHandle.values()) {
      if (entry.kind === "file" && entry.name.endsWith(".bin")) {
        const file = await entry.getFile();
        const buffer = await file.arrayBuffer();
        savestateBuffers.push(buffer);
      }
    }
    const encodedSavestream = encodeSavestream(savestateBuffers);
    const fileName = "last.savestream";

    const fileHandle = await dirHandle.getFileHandle(fileName, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(encodedSavestream), await writable.close();
    console.warn("last.savestream saved to disk")
    
    
  } else {
    // start recording savestream
    dirHandle = await window.showDirectoryPicker();
    recordButton.innerHTML = "stop recording";
    console.warn("started recording");
    isRecording = true;

    intervalId = setInterval(async () => {
      savestateLoop(dirHandle);
    }, 1000);
  }
});

function unpack(fileContent) {
  const blockStart = 16;
  const infoLenIndex = 3;

  let header = fileContent.slice(0, blockStart);

  // get infoLen from header
  let headerDV = new DataView(header);
  let infoLen = headerDV.getInt32(infoLenIndex * 4, true); // Set to true for little-endian, false for big-endian

  let infoSegment = fileContent.slice(blockStart, blockStart + infoLen);

  // align bufferOffset to the next multiple of 4 (32 bit = 4 bytes)
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

    // calculate padding to align length to blockSize
    let paddingLength = (blockSize - (length % blockSize)) % blockSize;

    // extract raw block and create new array with padding
    let rawBlock = new Uint8Array(bufferSegment, offset, length);
    let expandedBlock = new Uint8Array(length + paddingLength);
    expandedBlock.set(rawBlock);

    alignedBlocks.push(expandedBlock);
  }

  // concatenate all blocks into single array buffer
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

  // keeps track of unique blocks from this state
  const newBlocks = new Map();
  const blockSequence = [];

  for (let i = 0; i < blockCount; i++) {
    const offset = i * blockSize;
    const block = new Uint8Array(alignedBuffer, offset, blockSize); // a view into the large buffer

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

  for (let buffer of savestateBuffers) {
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
  }

  runButton.click();
  return MessagePack.encode(frames);
}

// Function to check and generate unique file name
async function getUniqueFileHandle(dirHandle, baseFileName) {
  let fileName = baseFileName;
  let counter = 1;

  while (true) {
    try {
      // Try to get the file handle
      const fileHandle = await dirHandle.getFileHandle(fileName, {
        create: false,
      });
      // If the file exists, increment the counter and try again
      fileName = baseFileName.replace(".msgpack", ` (${counter}).msgpack`);
      counter++;
    } catch (err) {
      // If the file doesn't exist, create the file handle
      return dirHandle.getFileHandle(fileName, { create: true });
    }
  }
}

async function savestateLoop(dirHandle) {
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
}

async function saveStateLoop2(dirHandle) {
  while (isRecording) {
    try {
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

      console.warn("state saved:", fileName);
    } catch (error) {
      console.error("Error saving state:", error);
    }

    if (isRecording) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
