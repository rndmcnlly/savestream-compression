let button = document.getElementById("load_files_button");
button.onclick = async function () {
  const handles = await window.showOpenFilePicker({
    multiple: true,
  });

  const reportArea = document.getElementById("report_area");
  const progressBar = document.getElementById("progress_bar");
  reportArea.innerHTML = "";

  let allBlocks = new Map();
  let fileReports = [];
  let numHandles = handles.length;
  for (let i = 0; i < numHandles; i++) {
    const handle = handles[i];
    let file = await handle.getFile();
    let buffer = await file.arrayBuffer();
//           let dataView = new DataView(buffer);
//           let magic = dataView.getUint32(0);

    let { uniqueBlocks, blockSequence } = findUniqueBlocks(buffer);

    fileReports.push({
      name: file.name,
      length: buffer.byteLength,
      blocks: blockSequence.length,
    });

    uniqueBlocks.forEach((block, index) => {
      const blockKey = new TextDecoder().decode(block);
      if(!allBlocks.has(blockKey)) {
        allBlocks.set(blockKey, block);
      }
    });

    progressBar.value = (100 * (i + 1)) / numHandles;
  }

  fileReports.forEach((report) => {
    const div = document.createElement("div");
    div.innerHTML = `${report.name}: ${JSON.stringify(report)}`;
    reportArea.append(div);
  });

  let saveHandle = await window.showSaveFilePicker({
    startIn: "downloads",
    suggestedName: "last.savestream"
  });
  let writeableHandle = await saveHandle.createWritable();
  await writeableHandle.write(new TextEncoder().encode("meow\n").buffer);
  await writeableHandle.close();
};

// params - (fileContent: ArrayBuffer)
// returns - {header: ArrayBuffer, infoSegment: ArrayBuffer, bufferSegment: ArrayBuffer}
function unpack(fileContent) {
  const blockStart = 16
  const infoLenIndex = 3
  
  let header = fileContent.slice(0, blockStart)
  
  // get infoLen from header
  let dv = new DataView(header)
  let infoLen = dv.getInt32(infoLenIndex * 4, true); // Set to true for little-endian, false for big-endian
  
  let infoSegment = fileContent.slice(blockStart, blockStart + infoLen)
  
  // align bufferOffset to the next multiple of 4 (32 bit = 4 bytes)
  let bufferOffset = blockStart + infoLen
  bufferOffset = bufferOffset + 3 & ~3
  
  
}

// params - {header: ArrayBuffer, infoSegment: ArrayBuffer, bufferSegment: ArrayBuffer}
// returns - (fileContent: ArrayBuffer)
function repack(header, infoSegment, bufferSegment) {
  
}

function align(header, infoSegment, bufferSegment) {
  
}

function unalign() {
  
}

function deduplicate() {
  
}

function reduplicate() {
  
}


function findUniqueBlocks(arrayBuffer) {
  const BLOCK_SIZE = 256;
  const blockCount = Math.floor(arrayBuffer.byteLength / BLOCK_SIZE);

  const uniqueBlockIds = new Map();
  const uniqueBlocks = [];

  const blockSequence = [];
  const decoder = new TextDecoder();

  for (let i = 0; i < blockCount; i++) {
    const offset = i * BLOCK_SIZE;

    const block = new Uint8Array(arrayBuffer, offset, BLOCK_SIZE); // a view into the large buffer
    const blockKey = decoder.decode(block);

    if (!uniqueBlockIds.get(blockKey)) {
      uniqueBlockIds.set(blockKey, uniqueBlockIds.size);
      uniqueBlocks.push(block.slice()); // an independent copy
    }
    blockSequence.push(uniqueBlockIds.get(blockKey));
  }

  return { uniqueBlocks, blockSequence };
}