let localCamStream,
	localScreenStream,
	localOverlayStream,
	rafId,
	cam,
	screen,
	mediaRecorder,
	audioContext,
	audioDestination;
let mediaWrapperDiv = document.getElementById("mediaWrapper");
let startWebcamBtn = document.getElementById("startWebcam");
let startScreenShareBtn = document.getElementById("startScreenShare");
let mergeStreamsBtn = document.getElementById("mergeStreams");
let startRecordingBtn = document.getElementById("startRecording");
let stopRecordingBtn = document.getElementById("stopRecording");
let stopAllStreamsBtn = document.getElementById("stopAllStreams");
let canvasElement = document.createElement("canvas");
let canvasCtx = canvasElement.getContext("2d");
let encoderOptions = { mimeType: "video/x-matroska;codecs=h264" };
//let encoderOptions = { mimeType: "video/webm; codecs=vp9" };
//let encoderOptions = { mimeType: "video/x-matroska;codecs=avc1" };
let recordedChunks = [];
let audioTracks = [];

/** disabling all buttons **/
const blockAllButton = function (callback) {

	document.querySelector("button#startRecording i").classList.remove("fa-beat-fade");
	
	document.getElementById("startScreenShare").setAttribute('disabled','');
	document.getElementById("mergeStreams").setAttribute('disabled','');
	document.getElementById("startRecording").setAttribute('disabled','');
	document.getElementById("stopRecording").setAttribute('disabled','');
	document.getElementById("stopAllStreams").setAttribute('disabled','');

	document.getElementById("startWebcam").classList.remove("disabled");
	document.getElementById("startScreenShare").classList.add("disabled");
	document.getElementById("mergeStreams").classList.add("disabled");
	document.getElementById("startRecording").classList.add("disabled");
	document.getElementById("stopRecording").classList.add("disabled");
	document.getElementById("stopAllStreams").classList.add("disabled");
}
blockAllButton();

/**
 * Internal Polyfill to simulate
 * window.requestAnimationFrame
 * since the browser will kill canvas
 * drawing when tab is inactive
 */
const requestVideoFrame = function (callback) {
	return window.setTimeout(function () {
		callback(Date.now());
	}, 1000 / 60); // 60 fps - just like requestAnimationFrame
};

/**
 * Internal polyfill to simulate
 * window.cancelAnimationFrame
 */
const cancelVideoFrame = function (id) {
	clearTimeout(id);
};

async function startWebcamFn() {
	localCamStream = await navigator.mediaDevices.getUserMedia({
		video: true,
		audio: { deviceId: { ideal: "communications" } }		
	});
	
	if (localCamStream) {
		cam = await attachToDOM("justWebcam", localCamStream);
	}

	document.getElementById("startWebcam").setAttribute('disabled','');
	document.getElementById("startWebcam").classList.add("disabled");	
	document.querySelector("button#startWebcam>i").classList.remove("fa-bounce");
	let btn0 = document.querySelector("button#startWebcam");
	btn0.removeEventListener("mouseover", ()=>console.log("removendo evento"));
	
	document.querySelector("button#startScreenShare i").classList.add("fa-bounce");	
	document.getElementById("startScreenShare").removeAttribute('disabled','');
	document.getElementById("startScreenShare").classList.remove("disabled");
}

async function startScreenShareFn() {
	localScreenStream = await navigator.mediaDevices.getDisplayMedia({
		video: true,
		audio: true
	});

	document.querySelector("button#startScreenShare i").classList.remove("fa-bounce");
	document.getElementById("startScreenShare").classList.add("disabled");
	document.getElementById("startScreenShare").setAttribute('disabled','');

	document.getElementById("mergeStreams").classList.remove("disabled");
	document.getElementById("mergeStreams").removeAttribute('disabled','');
	document.querySelector("button#mergeStreams i").classList.add("fa-bounce");


	if (localScreenStream) {
		screen = await attachToDOM("justScreenShare", localScreenStream);
	}
}

async function stopAllStreamsFn() {
	[
		...(localCamStream ? localCamStream.getTracks() : []),
		...(localScreenStream ? localScreenStream.getTracks() : []),
		...(localOverlayStream ? localOverlayStream.getTracks() : [])
	].map((track) => track.stop());
	localCamStream = null;
	localScreenStream = null;
	localOverlayStream = null;
	
	mediaRecorder = null;
	audioContext  = null;
	audioDestination = null;

	cancelVideoFrame(rafId);
	mediaWrapperDiv.innerHTML = "";
	document.getElementById("recordingState").innerHTML = "";

	blockAllButton();

	//window.location.search = "&" + Math.floor(Math.random() * 99999999);
}

async function makeComposite() {
	if (cam && screen) {
		canvasCtx.save();
		canvasElement.setAttribute("width", `${screen.videoWidth}px`);
		canvasElement.setAttribute("height", `${screen.videoHeight}px`);
		canvasCtx.clearRect(0, 0, screen.videoWidth, screen.videoHeight);
		canvasCtx.drawImage(screen, 0, 0, screen.videoWidth, screen.videoHeight);

		canvasCtx.drawImage(
			cam,
			0,
			Math.floor(screen.videoHeight - screen.videoHeight / 4), //790
			Math.floor(screen.videoWidth / 4), // 480
			Math.floor(screen.videoHeight / 4) // 263
		); // this is just a rough calculation to offset the webcam stream to bottom left

		let imageData = canvasCtx.getImageData(
			0,
			0,
			screen.videoWidth,
			screen.videoHeight
		); // this makes it work
		canvasCtx.putImageData(imageData, 0, 0); // properly on safari/webkit browsers too
		canvasCtx.restore();
		rafId = requestVideoFrame(makeComposite);
	}
}

async function mergeStreamsFn() {

	document.getElementById("mutingStreams").style.display = "block";
	await makeComposite();
	audioContext = new AudioContext();
	audioDestination = audioContext.createMediaStreamDestination();
	let fullVideoStream = canvasElement.captureStream();
	let existingAudioStreams = [
		...(localCamStream ? localCamStream.getAudioTracks() : []),
		...(localScreenStream ? localScreenStream.getAudioTracks() : [])
	];
	audioTracks.push(
		audioContext.createMediaStreamSource(
			new MediaStream([existingAudioStreams[0]])
		)
	);
	if (existingAudioStreams.length > 1) {
		audioTracks.push(
			audioContext.createMediaStreamSource(
				new MediaStream([existingAudioStreams[1]])
			)
		);
	}
	audioTracks.map((track) => track.connect(audioDestination));
	console.log(audioDestination.stream);
	localOverlayStream = new MediaStream([...fullVideoStream.getVideoTracks()]);
	let fullOverlayStream = new MediaStream([
		...fullVideoStream.getVideoTracks(),
		...audioDestination.stream.getTracks()
	]);
	console.log(localOverlayStream, existingAudioStreams);
	if (localOverlayStream) {
		overlay = await attachToDOM("pipOverlayStream", localOverlayStream);
		mediaRecorder = new MediaRecorder(fullOverlayStream, encoderOptions);
		mediaRecorder.ondataavailable = handleDataAvailable;
		overlay.volume = 0;
		cam.volume = 0;
		screen.volume = 0;
		cam.style.display = "none";
		// localCamStream.getAudioTracks().map(track => { track.enabled = false });
		screen.style.display = "none";
		// localScreenStream.getAudioTracks().map(track => { track.enabled = false });
	}

	document.getElementById("mergeStreams").setAttribute('disabled','');
	document.getElementById("mergeStreams").classList.add("disabled");
	document.querySelector("button#mergeStreams i").classList.remove("fa-bounce");
	
	document.querySelector("button#startRecording i").classList.add("fa-bounce");
	document.getElementById("startRecording").removeAttribute('disabled','');
	document.getElementById("startRecording").classList.remove("disabled");
}

async function startRecordingFn() {
	
	document.getElementById("stopRecording").classList.remove("disabled");
	document.getElementById("stopRecording").removeAttribute('disabled','');
		
	document.getElementById("startRecording").classList.add("disabled");
	document.getElementById("startRecording").setAttribute('disabled','');
	document.querySelector("button#startRecording i").classList.remove("fa-bounce");
	document.querySelector("button#startRecording i").classList.add("fa-beat-fade");

	mediaRecorder.start();
	console.log(mediaRecorder.state);
	console.log("recorder started");
	document.getElementById("pipOverlayStream").style.border = "10px solid red";
	document.getElementById("justWebcam").style.border = "10px solid green";
	document.getElementById(
		"recordingState"
	).innerHTML = `${mediaRecorder.state}...`;
}

async function attachToDOM(id, stream) {
	let videoElem = document.createElement("video");
	videoElem.id = id;
	videoElem.width = 640;
	videoElem.height = 360;
	videoElem.autoplay = true;
	videoElem.setAttribute("playsinline", true);
	videoElem.srcObject = new MediaStream(stream.getTracks());
	mediaWrapperDiv.appendChild(videoElem);
	return videoElem;
}

function handleDataAvailable(event) {
	console.log("data-available");
	if (event.data.size > 0) {
		recordedChunks=[]; // clear previous video
		recordedChunks.push(event.data);
		console.log(recordedChunks);
		download();		
	} else {
	}
}

function download() {
	var blob = new Blob(recordedChunks, {
		//type: "video/webm"
		type: "video/mp4"
	});
	var url = URL.createObjectURL(blob);
	var a = document.createElement("a");
	document.body.appendChild(a);
	a.style = "display: none";
	a.href = url;
	a.download = "result.mp4";
	a.click();
	window.URL.revokeObjectURL(url);
}

function stopRecordingFn() {
	mediaRecorder.stop();
	document.getElementById(
		"recordingState"
	).innerHTML = `${mediaRecorder.state}...`;
	document.getElementById("pipOverlayStream").style.border = "none";
	
	document.getElementById("stopRecording").classList.add("disabled");
	document.getElementById("stopRecording").setAttribute('disabled','');
	document.querySelector("button#stopRecording i").classList.remove("fa-bounce");

    document.getElementById("stopAllStreams").classList.remove("disabled");
	document.getElementById("stopAllStreams").removeAttribute('disabled','');
	
	document.querySelector("button#startRecording i").classList.remove("fa-bounce");
	document.querySelector("button#startRecording i").classList.remove("fa-beat-fade");
	document.getElementById("startRecording").classList.remove("disabled");
	document.getElementById("startRecording").removeAttribute('disabled','');	
}

startWebcamBtn.addEventListener("click", startWebcamFn);
startScreenShareBtn.addEventListener("click", startScreenShareFn);
mergeStreamsBtn.addEventListener("click", mergeStreamsFn);
stopAllStreamsBtn.addEventListener("click", stopAllStreamsFn);
startRecordingBtn.addEventListener("click", startRecordingFn);
stopRecordingBtn.addEventListener("click", stopRecordingFn);

btn1 = document.querySelector("button#startWebcam i");
btn1.addEventListener('mouseover', (event) => {
  event.target.classList.add('fa-bounce')
});