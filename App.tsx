import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import axios from 'axios';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function App() {
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);

  // Lock so we don't fire overlapping requests 
  const isProcessing = useRef(false);
  // The boxes to draw
  const [boxes, setBoxes] = useState<
    { x: number; y: number; width: number; height: number; label: string; confidence: number }[]
  >([]);

  // Request permission once
  useEffect(() => {
    Camera.requestCameraPermission();
  }, []);

  // Kick off a never-ending loop
  useEffect(() => {
    let active = true;
    async function loop() {
      while (active) {
        if (!isProcessing.current) {
          isProcessing.current = true;
          await captureAndDetect();
          isProcessing.current = false;
        }
        // small pause to avoid 100% CPU
        await new Promise(r => setTimeout(r, 100));
      }
    }
    loop();
    return () => {
      active = false;
    };
  }, [device]);

  // Capture, send, scale, and set boxes (or clear)
  const captureAndDetect = async () => {
    if (!cameraRef.current || !device) return;

    try {
      // 1) Grab a photo as fast as possible
      const photo = await cameraRef.current.takePhoto({
        qualityPrioritization: 'speed',
      });

      // 2) Build multipart form
      const form = new FormData();
      form.append('image', {
        uri: `file://${photo.path}`,
        type: 'image/jpeg',
        name: 'frame.jpg',
      } as any);

      // 3) POST to your FastAPI
      const res = await axios.post('http://35.178.183.95:8000/detect', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 5000,
      });

      // 4) If we got detections, scale them; otherwise clear
      const { image_width, image_height, detections } = res.data;
      if (!detections || detections.length === 0) {
        setBoxes([]);
        return;
      }

      const scaleX = screenWidth  / image_width;
      const scaleY = screenHeight / image_height;

      const scaled = detections.map((d: any) => ({
        x:      d.x      * scaleX,
        y:      d.y      * scaleY,
        width:  d.width  * scaleX,
        height: d.height * scaleY,
        label:      d.label,
        confidence: d.confidence,
      }));

      setBoxes(scaled);
    } catch (e) {
      console.warn('Inference error, clearing boxes', e.message || e);
      setBoxes([]); // clear on error
    }
  };

  return (
    <View style={styles.container}>
      {device && (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive
          photo
        />
      )}
      <Svg style={StyleSheet.absoluteFill}>
        {boxes.map((b, i) => (
          <React.Fragment key={i}>
            <Rect
              x={b.x}
              y={b.y}
              width={b.width}
              height={b.height}
              stroke="lime"
              strokeWidth="2"
              fill="transparent"
            />
            <SvgText
              x={b.x}
              y={b.y - 5}
              fill="lime"
              fontSize="14"
              fontWeight="bold"
            >
              {`${b.label} ${Math.round(b.confidence * 100)}%`}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
});
