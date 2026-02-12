const timingResults = {};

const pageLoadStart = performance.now();

function withTiming(fn, label) {
	return function (...args) {
		const start = performance.now();
		const result = fn.apply(this, args);
		const end = performance.now();
		const prev = parseFloat(timingResults[label] || 0);
	  	timingResults[label] = (prev + (end - start)).toFixed(2);
		return result;
	};
}


// JavaScript decoder helpers
let decodeAscii = withTiming(function (str) {
	const OFFSET = 32;
	return Array.from(str, c => c.charCodeAt(0) - OFFSET);
}, "decodeAscii");


let decodeDeltaAscii = withTiming(function (encodedStr, deltaMin) {
	const OFFSET = 32;
	return Array.from(encodedStr, c => (c.charCodeAt(0) - OFFSET) + deltaMin);
}, "decodeDeltaAscii");


let decodeCenteredDeltaAscii = withTiming(function (str, maxDelta = 47, offset = 32) {
	return Array.from(str, c => (c.charCodeAt(0) - offset) - maxDelta);
}, "decodeCenteredDeltaAscii");


// timed version (replaces your original function)
let deltaDecodeQuantized = withTiming(function (deltas, firstVal) {
  const result = [firstVal];
  for (let i = 0; i < deltas.length; i++) {
    result.push(result[result.length - 1] + deltas[i]);
  }
  return result;
}, "deltaDecodeQuantized");



// Drawing hooks
const drawHk = [
	(u) => {
		u.ctx.textAlign = "center";
		for (let i = 0; i < lbl.length - 1; i++) {
			if (lbl[i] != "null") {
				let startPos = u.valToPos(pos[i], "x", true);
				let width = u.valToPos(pos[i + 1], "x", true) - startPos;
				u.ctx.fillStyle = "black";
				u.ctx.fillText(lbl[i], startPos + width / 2, u.bbox.height + 7);
			}
		}
		u.ctx.textAlign = "left";
		u.ctx.fillText("right wrist", 7, u.valToPos(190, "y", true) - 40);
		u.ctx.fillText("left wrist", 7, u.valToPos(70, "y", true) - 60);
		u.ctx.fillText("right ankle", 7, u.valToPos(-50, "y", true) - 80);
		u.ctx.fillText("left ankle", 7, u.valToPos(-170, "y", true) - 100);
	}
];

const drawClearHk = [
	(u) => {
		for (let i = 0; i < pos.length - 1; i++) {
			if (lbl[i] != "null" && lbl[i] != "") {
				let startPos = u.valToPos(pos[i], "x", true);
				let width = u.valToPos(pos[i + 1], "x", true) - startPos;
				if (lbl[i].includes("stret")) u.ctx.fillStyle = "#F0FFE0";
				else if (lbl[i].includes("jogg")) u.ctx.fillStyle = "#FFFFE0";
				else if (lbl[i].includes("burp")) u.ctx.fillStyle = "#FFF0F0";
				else if (lbl[i].includes("lung")) u.ctx.fillStyle = "#FFF0FF";
				else u.ctx.fillStyle = "#F0F0FF";
				u.ctx.fillRect(startPos, u.bbox.top, width, u.bbox.height);
			}
		}
	}
];

const wheelZoomHk = [
	(u) => {
		let rect = u.over.getBoundingClientRect();
		u.over.addEventListener("wheel", (e) => {
			let oxRange = u.scales.x.max - u.scales.x.min;
			let nxRange = e.deltaY < 0 ? oxRange * 0.95 : oxRange / 0.95;
			let nxMin =
				u.posToVal(u.cursor.left, "x") - (u.cursor.left / rect.width) * nxRange;
			if (nxMin < 0) nxMin = 0;
			let nxMax = nxMin + nxRange;
			if (nxMax > u.data[0].length) nxMax = u.data[0].length;
			u.batch(() => {
				u.setScale("x", { min: nxMin, max: nxMax });
			});
		});
	},
];

// URL handling and script loading
d = document;
wl = window.location;
subj = d.getElementById("subjsel");
subj.value = wl.search.substr(5) === "" ? "0" : wl.search.substr(5);
subj.oninput = function () {
	wl.href = "index.html?sbj=" + subj.value;
};

function loadScript(url, callback) {
	var script = d.createElement("script");
	script.type = "text/javascript";
	script.src = url;
	script.onreadystatechange = callback;
	script.onload = callback;
	d.head.appendChild(script);
}

var plotData = function () {
	var top = d.getElementById("toprow");
	const inb = d.createElement("div");
	inb.setAttribute("class", "topblk");
	inb.innerHTML = "Gender: " + inf[0] + "<br/>Hand: " + inf[1];
	inb.innerHTML += "<br/>Age: " + inf[2] + "<br/>Height: " + inf[3];
	inb.innerHTML += "<br/>Weight: " + inf[4];
	inb.innerHTML += "<hr/>Private Workouts:<br/>" + inf[5];
	inb.innerHTML += "<br/>Frequency: " + inf[6];
	inb.innerHTML += "<hr/>Known Activities: " + inf[7];
	inb.innerHTML += "<br/>Regular Activities: " + inf[8];
	top.appendChild(inb);

	for (s = 0; s < sess.length; s++) {
		const session = document.createElement("div");
		session.setAttribute("class", "topblk");
		session.innerHTML = "Session " + sess[s][0];
		session.innerHTML += "<hr/>Duration: " + sess[s][1];
		session.innerHTML += "<hr/>Activities: " + sess[s][2];
		session.innerHTML += "<hr/>Month: " + sess[s][3];
		session.innerHTML += "<br/>" + sess[s][4];
		session.innerHTML += "<hr/>" + sess[s][5];
		session.innerHTML += "<hr/>Location_ID: " + sess[s][6];
		top.appendChild(session);
	}

	const flb = d.createElement("div");
	flb.setAttribute("class", "topblk");
	const dlpath =
		"https://uni-siegen.sciebo.de/s/enHPo7HwP8RccAe/download?path=%2Fraw%2F";
	var fHTML = 'Data Files: <hr/><a href="' + dlpath + "camera&files=sbj_";
	fHTML += subj.value + '.mp4">Video [' + fls[0] + "GB]</a><br/>";
	fHTML += '<a href="' + dlpath + "inertial%2F50hz&files=sbj_" + subj.value;
	fHTML += '.csv">IMU sensors [' + fls[1] + "MB]</a><br/><br/><br/><br/><hr/>";
	fHTML += '<a href="https://mariusbock.github.io/wear">main WEAR website</a>';
	flb.innerHTML = fHTML;
	top.appendChild(flb);

	var vid = d.getElementById("v0");
	const decodeStart = performance.now();

	const sensorKeys = [
		"raX", "raY", "raZ",
		"laX", "laY", "laZ",
		"rlX", "rlY", "rlZ",
		"llX", "llY", "llZ"
	];

	let decodedKeys = 0;

	for (const key of sensorKeys) {
		const rawData = window[key];
		const minVal = window[`${key}_min`];
		const maxVal = window[`${key}_max`];
		const firstVal = window[`${key}_first_val`];
		const maxDelta = window[`${key}_max_delta`];

		if (typeof rawData === "string" && typeof maxDelta !== "undefined" && typeof firstVal !== "undefined") {
			const deltas = decodeCenteredDeltaAscii(rawData, maxDelta);
			const decodequantized = deltaDecodeQuantized(deltas, firstVal);

			window[key] = decodequantized;
			console.log(`✅ Reconstructed Delta Quantized data ${key}:`, window[key].slice(0, 40));

		} else if (typeof rawData === "string") {
			// Handle ascii-encoded quantized values (uniform/adaptive/bitdepth)
			const decoded = decodeAscii(rawData);
			window[key] = decoded;

		} else if (Array.isArray(rawData)) {
			const hasDeltaMeta =
				typeof window[`${key}_first_val`] !== "undefined" &&
				typeof minVal !== "undefined" &&
				typeof maxVal !== "undefined";

			if (hasDeltaMeta) {
				const firstVal = window[`${key}_first_val`];
				const decodedQ = deltaDecodeQuantized(rawData, firstVal);
				window[key] = decodedQ;
				console.log(`✅ Reconstructed Quantized data ${key}:`, window[key].slice(0, 40));
			} else {
				window[key] = rawData.map(Number);
				console.log(`✅ Quantized array for ${key}:`, window[key].slice(0, 40));
			}
		}
		decodedKeys++;
		if (decodedKeys === sensorKeys.length) {
			drawPlot();
		}
	}
	const decodeEnd = performance.now();
	timingResults["totalDecode"] = (decodeEnd - decodeStart).toFixed(2);


	function drawPlot() {
		const k = [...Array(raX.length).keys()];
		const offsetData = (arr, offset) => {
			if (!Array.isArray(arr)) {
				console.warn("⚠️ offsetData called on non-array:", arr);
				return [];  // Return empty array or handle gracefully
			}
			return arr.map(val => val + offset);
		};

		const dataStart = performance.now();  // Start before actual computation
		const data = [
			k,
			offsetData(raX, 150), offsetData(raY, 150), offsetData(raZ, 150),
			offsetData(laX, 50),  offsetData(laY, 50),  offsetData(laZ, 50),
			offsetData(rlX, -50), offsetData(rlY, -50), offsetData(rlZ, -50),
			offsetData(llX, -150),offsetData(llY, -150),offsetData(llZ, -150),
		];

		const dataEnd = performance.now();    // Stop after it's built
		timingResults["dataArrayBuild"] = (dataEnd - dataStart).toFixed(2);

		const plotStart = performance.now();

		let sers = [{ fill: false, ticks: { show: false } }];
		for (let i = 0; i < 12; i++) {
			const c = i % 3 === 0 ? "red" : i % 3 === 1 ? "green" : "blue";
			let l = i % 6 < 3 ? "r" : "l";
			l += i < 6 ? "a" : "l";
			l += i % 3 === 0 ? "x" : i % 3 === 1 ? "y" : "z";
			sers.push({ label: l, stroke: c });
		}

		let opts = {
			id: "chrt",
			width: window.innerWidth - 9,
			height: 400,
			series: sers,
			cursor: {
				bind: {
					mousedown: (u, targ, handler) => {
						return (e) => {
							vid.currentTime = Math.floor(
								(vid.duration * u.cursor.idx) / u.data[0].length,
							);
							if (vid.paused) vid.play();
						};
					},
				},
				y: false,
			},
			hooks: {
				draw: drawHk,
				drawClear: drawClearHk,
				ready: wheelZoomHk
			},
			axes: [
				{},
				{
					scale: "readings",
					side: 1,
					grid: { show: true },
					ticks: { show: false },
					values: () => [],
				},
			],
			scales: {
				auto: false,
				x: { time: false },
				readings: { min: -250, max: 250 },
			},
			legend: { show: false },
		};

		let uplot = new uPlot(opts, data, document.body);
		const plotEnd = performance.now();
		timingResults["drawPlot"] = (plotEnd - plotStart).toFixed(2);

		vid.ontimeupdate = function () {
			let p = Math.floor((vid.currentTime / vid.duration) * data[0].length);
			uplot.setCursor({ left: uplot.valToPos(data[0][p], "x") });
		};

		d.getElementById("chrt").style.border = "solid";
		d.body.appendChild(
			d.createElement("p").appendChild(
				d.createTextNode("Click on plot to play, scroll wheel zooms")
			),
		);

		cursorOverride = d.getElementsByClassName("u-cursor-x");
		cursorOverride[0].style = "border-right:3px solid #FF2D7D;";

		const pageBeforeVideo = performance.now();
		timingResults["totalBeforeVideo"] = (pageBeforeVideo - pageLoadStart).toFixed(2);

		vid.src = "s" + subj.value + ".mp4?ts=" + timestamp;
		vid.load();

		const pageLoadEnd = performance.now();
		timingResults["totalWebpageTime"] = (pageLoadEnd - pageLoadStart).toFixed(2);

		displayTimings();
	}
	
	function displayTimings() {
	const timeBlk = document.createElement("div");
	timeBlk.className = "topblk";
	timeBlk.innerHTML = "<b>⏱ Timing Info (ms) + Speed & FPS</b><hr/>";

	const sampleCount = raX?.length || 1;  // number of time points

	for (const [fn, time] of Object.entries(timingResults)) {
		const t = parseFloat(time);
		let extra = "";

		if ((fn === "totalDecode" || fn === "dataArrayBuild") && t > 0) {
			const speed = (sampleCount / t).toFixed(2);
			extra = ` → ${speed} samples/ms`;
		}

		if (fn === "drawPlot" && t > 0) {
			const fps = (1000 / t).toFixed(1);
			extra = ` → ${fps} FPS`;
		}

		timeBlk.innerHTML += `${fn}: ${time} ms${extra}<br/>`;
	}

	document.getElementById("toprow").appendChild(timeBlk);
}


};

const timestamp = new Date().getTime();
loadScript(`dta${subj.value}.js?ts=${timestamp}`, plotData);

