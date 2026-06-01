import { useState, useRef } from "react";
import Webcam from "react-webcam";
import "./App.css";

function App() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [image, setImage] = useState("");
  const [voiceText, setVoiceText] = useState("");

  const webcamRef = useRef(null);

  // API URL
  const API_BASE =
    window.location.hostname === "localhost"
      ? "http://localhost:5000"
      : "https://ai-demo-new-1.onrender.com";

  // CHAT
  const sendMessage = async () => {
    try {
      setReply("Loading...");

      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setReply(data.reply);
    } catch (error) {
      console.log(error);
      setReply(error.message || "Error");
    }
  };

  // IMAGE GENERATOR
  const generateImage = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/generate-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: imagePrompt,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setImage(data.image);
    } catch (error) {
      console.log(error);
      alert(error.message);
    }
  };

  // VOICE
  const handleVoice = async (e) => {
    try {
      const formData = new FormData();

      formData.append(
        "audio",
        e.target.files[0]
      );

      const response = await fetch(
        `${API_BASE}/voice`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      setVoiceText(data.text);
    } catch (error) {
      console.log(error);
      alert(error.message);
    }
  };

  // FACE CAPTURE
  const capture = () => {
    const imageSrc =
      webcamRef.current.getScreenshot();

    console.log(imageSrc);

    alert("Face Captured");
  };

  return (
    <div className="container">
      <h1>AI Demo App</h1>

      {/* CHATBOT */}
      <div className="card">
        <h2>AI Chatbot</h2>

        <input
          type="text"
          placeholder="Ask something..."
          value={message}
          onChange={(e) =>
            setMessage(e.target.value)
          }
        />

        <button onClick={sendMessage}>
          Send
        </button>

        <div className="output">
          {reply}
        </div>
      </div>

      {/* IMAGE */}
      <div className="card">
        <h2>AI Image Generator</h2>

        <input
          type="text"
          placeholder="Image prompt"
          value={imagePrompt}
          onChange={(e) =>
            setImagePrompt(
              e.target.value
            )
          }
        />

        <button onClick={generateImage}>
          Generate
        </button>

        {image && (
          <img
            src={image}
            alt="AI"
            className="image"
          />
        )}
      </div>

      {/* VOICE */}
      <div className="card">
        <h2>Voice To Text</h2>

        <input
          type="file"
          accept="audio/*"
          onChange={handleVoice}
        />

        <div className="output">
          {voiceText}
        </div>
      </div>

      {/* FACE */}
      <div className="card">
        <h2>Face Detection</h2>

        <Webcam
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          className="webcam"
        />

        <button onClick={capture}>
          Capture Face
        </button>
      </div>
    </div>
  );
}

export default App;