async function getMedia(constraints) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { exact: 200 },
        height: { exact: 200 },
      },
    });
    return stream;
  } catch (error) {
    console.log(error, 'error');
    return;
  }
}

window.addEventListener('load', async () => {
  const videoElement = document.getElementById('camera-feed-display');
  try {
    const cameraStream = await getMedia();
    window.top.postMessage({ type: 'START_CAMERA_RES', data: { isCamera: !!cameraStream } }, '*');
    videoElement.srcObject = cameraStream;
    videoElement.onloadedmetadata = (e) => {
      videoElement.play();
    };
  } catch (error) {
    window.top.postMessage({ type: 'ERROR', message: error, code: 'INTERNAL_ERROR' }, '*');
    return;
  }
});
