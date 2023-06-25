/// <reference types="aws-sdk" />

/** @type{MediaStream} */
let screenShareStream;
/** @type{MediaRecorder} */
let mediaRecorder;

let s3Credentials;

/** @type {AWS.S3} */
let s3Service = new AWS.S3();

/** @type {AWS.S3.CreateMultipartUploadOutput} */
let currentStreamingUpload;
let partNo = 1;
const streamUploadedParts = [];
const streamPartProgress = {};
const recordingBucket = 'coolrecordings';
let onPartComplete;
/** @type {Blob[]} */
const blobParts = [];

/** @type {AWS.S3.CompleteMultipartUploadOutput} */
let completeMultipartUpload;

/** @type {number} */
let screenRecorderTimerInterval;

/** @type {number} */
let secondsPassed = 0;

function secondsToTimerText(seconds) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function bytesToMb(bytes) {
  if (!bytes) {
    return bytes;
  }
  return bytes / (1024 * 1024);
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function getMedia(constraints) {
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  return stream;
}

async function initStreamUpload(s3Credentials) {
  if (!s3Credentials || !s3Credentials.accessKeyId || !s3Credentials.secretAccessKey || !s3Credentials.sessionToken) {
    const tempCredsRes = await fetch('https://recording.coolbrandsstore.com/api/v1/recorders/temp-creds').then((r) => r.json());
    s3Credentials = tempCredsRes.data;
  }

  s3Service.config.update({
    region: s3Credentials.region || 'us-east-1',
    credentials: {
      accessKeyId: s3Credentials.accessKeyId,
      secretAccessKey: s3Credentials.secretAccessKey,
      sessionToken: s3Credentials.sessionToken,
    },
  });

  uniqueRecordingId = uuid();

  currentStreamingUpload = await s3Service
    .createMultipartUpload({
      Bucket: recordingBucket,
      Key: `dev/${uniqueRecordingId}.webm`,
    })
    .promise();
  return uniqueRecordingId;
}

/**
 * To start uploading parts
 * @param {Blob} data
 */
async function doMultipartUpload() {
  const blob = new Blob(blobParts);
  blobParts.length = 0;
  if (!currentStreamingUpload) {
    return;
  }
  const curIndex = streamUploadedParts.push({ partNo, inProgress: true }) - 1;
  const partData = await s3Service
    .uploadPart({
      UploadId: currentStreamingUpload.UploadId,
      Bucket: currentStreamingUpload.Bucket,
      Key: currentStreamingUpload.Key,
      PartNumber: partNo,
      Body: blob,
    })
    .promise();
  streamUploadedParts[curIndex] = { partNo, inProgress: false, eTag: partData.ETag };
  partNo++;
  if (onPartComplete) {
    onPartComplete();
  }
}

async function onSaveStream() {
  if (!currentStreamingUpload) {
    return;
  }
  if (streamUploadedParts.find((streamPart) => streamPart.inProgress)) {
    onPartComplete = onSaveStream;
    return;
  }
  const data = await s3Service
    .completeMultipartUpload({
      UploadId: currentStreamingUpload.UploadId,
      Bucket: currentStreamingUpload.Bucket,
      Key: currentStreamingUpload.Key,
      MultipartUpload: {
        Parts: streamUploadedParts.map((part) => ({ PartNumber: part.partNo, ETag: part.eTag })),
      },
    })
    .promise();
  /** @type {HTMLAnchorElement} */
  const downloadButton = document.getElementById('download-button');
  downloadButton.href = data.Location;
  displayMediaSavedControls();
  currentStreamingUpload = undefined;
}

async function cancelStreaming() {
  if (!currentStreamingUpload) {
    return;
  }
  await s3Service
    .abortMultipartUpload({
      UploadId: currentStreamingUpload.UploadId,
      Bucket: currentStreamingUpload.Bucket,
      Key: currentStreamingUpload.Key,
    })
    .promise();
  currentStreamingUpload = undefined;
  window.top.postMessage({ type: 'EXIT_STREAM' }, '*');
}

function onStopButtonClick(event) {
  stopStreaming();
  event.stopPropagation();
}

// eslint-disable-next-line no-unused-vars
async function onExitButtonClick(event) {
  await cancelStreaming();
  event.stopPropagation();
}

function onPauseResumeButtonClick(event) {
  const iconElement = document.getElementById('pause-resume-button').firstElementChild;
  if (mediaRecorder.state !== 'paused') {
    clearInterval(screenRecorderTimerInterval);
    mediaRecorder.pause();
    iconElement.classList.toggle('fa-pause-circle');
    iconElement.classList.toggle('fa-play-circle');
  } else {
    screenRecorderTimerInterval = setInterval(() => {
      const spanElement = document.getElementById('timer-component');
      secondsPassed += 1;
      spanElement.innerText = secondsToTimerText(secondsPassed);
    }, 1000);
    mediaRecorder.resume();
    iconElement.classList.toggle('fa-pause-circle');
    iconElement.classList.toggle('fa-play-circle');
  }
  event.stopPropagation();
}

async function onSaveMediaButtonClick(event) {
  await onSaveStream();
  event.stopPropagation();
}

async function onCancelMediaButtonClick(event) {
  await cancelStreaming();
  event.stopPropagation();
}

async function onCopyButtonClick(event) {
  /** @type {HTMLAnchorElement} */
  const downloadButton = document.getElementById('download-button');
  await navigator.clipboard.writeText(downloadButton.href);
  event.stopPropagation();
}

function displayMediaControls() {
  const basicControls = document.getElementById('basic-controls');
  const saveMediaControls = document.getElementById('save-media-controls');
  const mediaSavedControls = document.getElementById('media-saved-controls');
  basicControls.classList.add('hide');
  saveMediaControls.classList.remove('hide');
  mediaSavedControls.classList.add('hide');
}

function displayBasicControls() {
  const basicControls = document.getElementById('basic-controls');
  const saveMediaControls = document.getElementById('save-media-controls');
  const mediaSavedControls = document.getElementById('media-saved-controls');
  basicControls.classList.remove('hide');
  saveMediaControls.classList.add('hide');
  mediaSavedControls.classList.add('hide');
}

function displayMediaSavedControls() {
  const basicControls = document.getElementById('basic-controls');
  const saveMediaControls = document.getElementById('save-media-controls');
  const mediaSavedControls = document.getElementById('media-saved-controls');
  basicControls.classList.add('hide');
  saveMediaControls.classList.add('hide');
  mediaSavedControls.classList.remove('hide');
}

function stopStreaming() {
  mediaRecorder.stop();
  screenShareStream.getTracks().map((t) => t.stop());
  displayMediaControls();
  window.top.postMessage({ type: 'STREAM_CLOSED', isStream: true }, '*');
}

async function startStreaming(streamId, s3Credentials) {
  if (screenShareStream) {
    window.top.postMessage({ type: 'ERROR', message: 'Streaming is already in progress', code: 'STREAM_IN_PROGRESS' }, '*');
    return;
  }
  try {
    screenShareStream = await getMedia({
      audio: false,
      video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: streamId } },
    });
    const audioStream = await getMedia({
      audio: true,
      video: false,
    });
    screenShareStream.addTrack(audioStream.getTracks()[0]);
    mediaRecorder = new MediaRecorder(screenShareStream, { mimeType: 'video/webm' });
    mediaRecorder.onstop = (event) => {
      if (blobParts.length) {
        doMultipartUpload();
      }
    };
    mediaRecorder.ondataavailable = (event) => {
      blobParts.push(event.data);
      if (bytesToMb(blobParts.reduce((total, blob) => total + blob.size, 0)) >= 5) {
        doMultipartUpload();
      }
    };
    const recordingId = await initStreamUpload(s3Credentials);
    const startedAt = Date.now();
    mediaRecorder.start(15000);
    screenShareStream.getVideoTracks()[0].addEventListener('ended', () => {
      stopStreaming();
    });
    const spanElement = document.getElementById('timer-component');
    spanElement.innerText = secondsToTimerText(secondsPassed);
    screenRecorderTimerInterval = setInterval(() => {
      secondsPassed += 1;
      const spanElement = document.getElementById('timer-component');
      spanElement.innerText = secondsToTimerText(secondsPassed);
    }, 1000);
    window.top.postMessage({ type: 'STREAM_STARTED', recordingId, startedAt }, '*');
  } catch (error) {
    window.top.postMessage({ type: 'ERROR', message: error, code: 'INTERNAL_ERROR' }, '*');
  }
}

window.addEventListener('load', () => {
  document.getElementById('stop-record-button').addEventListener('click', onStopButtonClick);
  document.getElementById('exit-record-button').addEventListener('click', onExitButtonClick);
  document.getElementById('pause-resume-button').addEventListener('click', onPauseResumeButtonClick);
  document.getElementById('save-media-button').addEventListener('click', onSaveMediaButtonClick);
  document.getElementById('cancel-media-button').addEventListener('click', onCancelMediaButtonClick);
  document.getElementById('copy-url-button').addEventListener('click', onCopyButtonClick);
  document.getElementById('exit-button').addEventListener('click', onExitButtonClick);
});

window.addEventListener('message', async function (mEvent) {
  if (!mEvent.data || typeof mEvent.data !== 'object') {
    return;
  }
  if (mEvent.data.type === 'START_STREAMING') {
    await startStreaming(mEvent.data.streamId, mEvent.data.s3Credentials);
    return;
  }
  if (mEvent.data.type === 'STOP_STREAMING') {
    stopStreaming();
    return;
  }
  if (mEvent.data.type === 'CANCEL_STREAMING') {
    await cancelStreaming();
    return;
  }
});
