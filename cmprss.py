#!/usr/bin/env python3
import sys,csv
import numpy as np
from subprocess import Popen, PIPE
import mediapipe as mp
import cv2
import json

# --- Compression Options ---
quantization_method = "uniform"  # "uniform", "adaptive", "bitdepth", "delta"
compression_mode = "string"  # "array" or "string"
encoding_method = "ascii_1byte" 

subj = str(0
)  # here we set the subject to compress

# start up mediapipe:
#mp_drawing = mp.solutions.drawing_utils # Drawing helperss
#mp_holistic = mp.solutions.holistic # Mediapipe Solutions
#holistic = mp_holistic.Holistic(min_detection_confidence=0.3, min_tracking_confidence=0.5, static_image_mode=False, model_complexity=2)

# compres CSV file into a js-friendly low-res js file
#data_path = "D:/Master Thesis/project/Quantization_compression_techniques/compression_notebook/Wearviz-temp/"
with open('sbj_'+subj+'.csv') as f:
	reader = csv.reader(f, delimiter = ',')
	adata = list(reader)
print(adata[0])
# arbitrarily skipped datapoints and quantization, just to test
skipSize = 1; quant = 10
# create data structure:
acc = np.zeros([12,int(len(adata)/skipSize)+1])  # add one extra (might be left 0)
i=0
prvLabel=-1;  # start with unknown previous class
indx = []
clss = []
for row in adata[1:-1:skipSize]:
    for sensor in range(0, 12):
        val = row[sensor+1].strip()
        acc[sensor][i] = float(val) if val != '' else 0.0 
    if row[13] != prvLabel:
        indx.append(i)
        clss.append(row[13])
        prvLabel = row[13]
    i += 1

# Quantization Methods
def uniform_quantization(data, num_levels=95):
    min_val = np.min(data)
    max_val = np.max(data)
    normalized = (data - min_val) / (max_val - min_val)
    quantized = np.round(normalized * (num_levels - 1))
    return quantized.astype(int)

def adaptive_quantization(data, segment_size=None, num_levels=95):
    if segment_size is None:
        segment_size = len(data)
    data = np.asarray(data)
    quantized = np.zeros_like(data, dtype=int)
    for start in range(0, len(data), segment_size):
        end = min(start + segment_size, len(data))
        seg = data[start:end]
        xmin, xmax = seg.min(), seg.max()
        if xmax == xmin:
            continue
        step = (xmax - xmin) / (num_levels - 1)
        levels = np.round((seg - xmin) / step).astype(int)
        quantized[start:end] = levels
    return quantized

def bit_depth_reduction(data, target_bits=8, ascii_max=94):
    min_val = np.min(data)
    max_val = np.max(data)
    scale = (2**target_bits - 1) / (max_val - min_val)
    quantized = np.round((data - min_val) * scale).astype(int)
    if quantized.max() > 0:
        quantized = np.round((quantized / quantized.max()) * ascii_max).astype(int)
    return quantized

def delta_encode_quantized(data, num_levels=95):
    min_val, max_val = float(np.min(data)), float(np.max(data))
    if max_val == min_val:
        quantized = np.zeros_like(data, dtype=int)
        first_val = 0
        deltas = np.zeros_like(quantized, dtype=int)
        return deltas, min_val, max_val, quantized, first_val

    normalized = (data - min_val) / (max_val - min_val)
    quantized = np.floor(normalized * (num_levels - 1)).astype(int)
    first_val = int(quantized[0])
    deltas = np.diff(quantized, prepend=first_val)
    return deltas, min_val, max_val, quantized, first_val

def encode_centered_delta_ascii(deltas, max_delta=47):
    deltas = np.asarray(deltas[1:], dtype=int)         
    clamped = np.clip(deltas, -max_delta, max_delta)  
    shifted = clamped + max_delta                       
    return ''.join(chr(32 + int(v)) for v in shifted), int(max_delta)


# ASCII Encoders
def encode_ascii_printable_1byte(values):
    """Encode values as ASCII printable characters (1 byte per value)."""
    return ''.join([chr(32 + v) for v in values])


filename = f'dta{subj}.js'

stats = []

# Write to JS file
with open(filename, "w", encoding='utf-8') as f:
    f.write('var inf = ["male", "right", "≥40", "180-189 cm", "70-79 kg.", "Cycling", 5, 5, 0];\n')
    f.write('var sess = [[1, "16:33:30", 7, "mid-Oct.", "morning", "sunny, ≈10◦C", 1],\n')
    f.write('             [2, "11:55:00", 6, "mid-Oct.", "afternoon", "partly-cloudy, ≈10◦C", 1],\n')
    f.write('             [3, "18:06:00", 7, "late-Oct.", "afternoon", "partly-cloudy, ≈20◦C", 1]];\n')
    f.write('var fls = [6.5, 31.5];\n')

    sensor_names = ["raX", "raY", "raZ", "laX", "laY", "laZ", "rlX", "rlY", "rlZ", "llX", "llY", "llZ"]

    for i, sensor in enumerate(sensor_names):
        data_slice = acc[i]
        if len(data_slice) < 2:
            print(f"[Warning] Skipping {sensor} due to short data length.")
            continue

        if quantization_method == "uniform":
            quantized = uniform_quantization(data_slice)
        elif quantization_method == "adaptive":
            quantized = adaptive_quantization(data_slice)
        elif quantization_method == "bitdepth":
            quantized = bit_depth_reduction(data_slice)
        elif quantization_method == "delta":
            deltas, min_val, max_val, quantized, first_val = delta_encode_quantized(data_slice)

            stats.append((quantized.astype(int)))

            if compression_mode == "array":
                f.write(f"var {sensor}=[{','.join(map(str, deltas))}];\n")
                f.write(f"var {sensor}_first_val={first_val};\n")
                f.write(f"var {sensor}_min={min_val};\n")
                f.write(f"var {sensor}_max={max_val};\n")

            elif compression_mode == "string":
                ascii_encoded, max_delta = encode_centered_delta_ascii(deltas, max_delta=47)
                escaped_encoded = json.dumps(ascii_encoded)
                f.write(f"var {sensor} = {escaped_encoded};\n")
                f.write(f"var {sensor}_first_val = {first_val};\n")
                f.write(f"var {sensor}_max_delta = {max_delta};\n")
                f.write(f"var {sensor}_min = {min_val};\n")
                f.write(f"var {sensor}_max = {max_val};\n")

            else:
                raise ValueError("Invalid compression mode")
            continue

        else:
            raise ValueError("Invalid quantization method")
        
        stats.append((quantized.astype(int)))

        if compression_mode == "array":
            f.write(f"var {sensor}=[{','.join(map(str, quantized))}];\n")
        elif compression_mode == "string":
            if encoding_method == "ascii_1byte":
                encoded = encode_ascii_printable_1byte(quantized)
            else:
                raise ValueError("Invalid encoding method")
            f.write(f"var {sensor}={repr(encoded)};\n")
        else:
            raise ValueError("Invalid compression mode")

    f.write(f"var pos=[{','.join(map(str, indx))}];\n")
    f.write("var lbl=['" + "','".join(clss) + "'];\n")

print(f"Saved {filename} with mode={compression_mode}, encoding={encoding_method if compression_mode=='string' else 'n/a'}, quantization={quantization_method}")

if len(stats) > 0:
    all_q = np.concatenate(stats)  
    q_min = int(all_q.min())
    q_max = int(all_q.max())
    q_range = int(q_max - q_min)
    q_var = float(np.var(all_q))   
    q_std = float(np.std(all_q))  

    counts = np.bincount(all_q, minlength=95)
    probs = counts / counts.sum() if counts.sum() > 0 else counts
    nonzero = probs > 0
    q_entropy_bits = float((-probs[nonzero] * np.log2(probs[nonzero])).sum())

    print("\n=== Global Quantized Statistics (across all 12 signals) ===")
    print(f"Subject: {subj}")
    print(f"Min: {q_min} | Max: {q_max} | Range: {q_range}")
    print(f"Variance: {q_var:.4f} | Std Dev: {q_std:.4f}")
    print(f"Shannon Entropy: {q_entropy_bits:.4f} bits")
    print("\n")
else:
    print("\n[Info] No quantized data collected; global statistics not computed.\n")
exit(0)  # remove this for the video:

# Example to get 3rd person view video and obtain skeleton:
#tpvmovfile = '/Users/kvl/sciebo/Projects/trimmed_WEAR_clip/sbj_18_tpv_25f.mp4'  #
#vidcap_movtpv = cv2.VideoCapture(tpvmovfile)
#duration = (60*37)+21
#for i in range(0,int((10)*duration)):
#    success,image_movtpv = vidcap_movtpv.read()
    # To improve performance, optionally mark the image as not writeable to pass by reference:
    #image_movtpv.flags.writeable = True
    # detect pose in third person view video frame:
    #image_movtpv = cv2.cvtColor(image_movtpv, cv2.COLOR_BGR2RGB)
#    results = holistic.process(image_movtpv)
#    print(results.pose_landmarks)
#    print("\n\n")


# compress the original raw video into a 2Hz low-res video for quick access:
# e.g.: subj_0.mp4  is changed into s0.mp4
s = "ffmpeg -i sbj_"+subj+".mp4 -vf \"scale=trunc(iw/25)*2:trunc(ih/25)*2\" -r "+str(int(50/skipSize))+" -map 0 -map -0:a s"+subj+".mp4"
print("executing:\n "+s)
#p = Popen([s], stdout=PIPE, stderr=PIPE, shell=True, executable="/bin/bash")
#stdout, stderr = p.communicate()
#outstr = stdout.decode('utf-8').strip('\n').strip('\r')