let button = document.getElementById("load_files_button");

button.onclick = async function () {
  const handles = await window.showOpenFilePicker({
    multiple: true,
  });

  // styling around file picker
  const reportArea = document.getElementById("report_area");
  const progressBar = document.getElementById("progress_bar");
  reportArea.innerHTML = "";

  let allBlocks = new Map();
  let fileReports = [];
  let numHandles = handles.length;
  
  // loop through each file
  for (let i = 0; i < numHandles; i++) {
    const handle = handles[i];
    let file = await handle.getFile();
    let buffer = await file.arrayBuffer();
    let view32 = new Uint32Array(buffer);
    let dataView = new DataView(buffer);
    // let magic = dataView.getUint32(0);

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

// unpacks an array buffer containing a v86 state into a header, info, and buffer segment
// params - (fileContent: ArrayBuffer)
// returns - {header: ArrayBuffer, infoSegment: ArrayBuffer, bufferSegment: ArrayBuffer}
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
  bufferOffset = bufferOffset + 3 & ~3;
  
  let bufferSegment = fileContent.slice(bufferOffset);
  
  return {header, infoSegment, bufferSegment};
}

// takes in header, infoSegment, and bufferSegment and reconstructs original buffer
// params - (header: ArrayBuffer, infoSegment: ArrayBuffer, bufferSegment: ArrayBuffer)
// returns - fileContent: ArrayBuffer
function repack(header, infoSegment, bufferSegment) {
  // find padded info segment total length
  let infoLen = infoSegment.byteLength;
  let padding = (infoLen + 3 & ~3) - infoLen;
  
  // create new arraybuffer for paddedInfoSegment
  let paddedInfoSegment = new Uint8Array(infoLen + padding);
  paddedInfoSegment.set(new Uint8Array(infoSegment));
  
  // create fileContent array buffer with total length of header, padderInfoSegment, and bufferSegment
  let fileContent = new Uint8Array(header.byteLength + paddedInfoSegment.byteLength + bufferSegment.byteLength);
  
  // populate final buffer
  fileContent.set(new Uint8Array(header), 0);
  fileContent.set(paddedInfoSegment, header.byteLength);
  fileContent.set(new Uint8Array(bufferSegment), header.byteLength + paddedInfoSegment.byteLength);
  
  return fileContent.buffer;
}

// aligns all buffers in buffer segment to an alignment of specified block size
// params - (infoSegment: ArrayBuffer, bufferSegment: ArrayBuffer, blockSize: int)
// returns - alignedBuffer: arrayBuffer
function align(infoSegment, bufferSegment, blockSize) {
  let decoder = new TextDecoder("utf-8");
  let info = JSON.parse(decoder.decode(infoSegment));
  
  let alignedBlocks = []
  for(let infoBlock in info.buffer_infos) {
    let offset = info.offset
    let length = info.length
    
    // calculate padding to align length to blockSize
    let paddingLength = (blockSize - (length % blockSize)) % blockSize
    
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
  for(let block in alignedBlocks) {
    alignedBuffer.set(block, offset);
    offset += block.length
  }
  
  return alignedBuffer.buffer;
}

// unaligns buffer segment to default alignment used by v86
// params - (infoSegment: ArrayBuffer, alignedBuffer: ArrayBuffer, blockSize)
// returns - unalignedBuffer: ArrayBuffer
function unalign(infoSegment) {
  
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