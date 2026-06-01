
import {
  useEffect,
  useRef,
  useState,
} from "react";

import { FaMicrophone, FaPaperPlane, FaImage, FaCopy, FaTrash, } from "react-icons/fa";

import "./App.css";

function App() {

  const [message, setMessage] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [selectedImage, setSelectedImage] =
    useState(null);

  const [allChats, setAllChats] =
    useState([]);

  const [currentChatId, setCurrentChatId] =
    useState(null);

  const [messages, setMessages] =
    useState([]);

  const messagesEndRef =
    useRef(null);

  const fileInputRef =
    useRef(null);


  // LOAD CHATS
  useEffect(() => {

    const savedChats =
      localStorage.getItem(
        "all-ai-chats"
      );

    const activeChat =
      localStorage.getItem(
        "active-chat-id"
      );

    if (savedChats) {

      const parsed =
        JSON.parse(savedChats);

      setAllChats(parsed);

      if (
        activeChat &&
        parsed.length > 0
      ) {

        const foundChat =
          parsed.find(
            (chat) =>
              chat.id ===
              Number(activeChat)
          );

        if (foundChat) {

          setCurrentChatId(
            foundChat.id
          );

          setMessages(
            foundChat.messages
          );

        } else {

          setCurrentChatId(
            parsed[0].id
          );

          setMessages(
            parsed[0].messages
          );
        }

      } else if (
        parsed.length > 0
      ) {

        setCurrentChatId(
          parsed[0].id
        );

        setMessages(
          parsed[0].messages
        );
      }
    }

  }, []);


  // SAVE CHATS
  useEffect(() => {

    if (allChats.length > 0) {

      localStorage.setItem(
        "all-ai-chats",

        JSON.stringify(allChats)
      );
    }

  }, [allChats]);


  // SAVE ACTIVE CHAT
  useEffect(() => {

    if (currentChatId) {

      localStorage.setItem(
        "active-chat-id",

        currentChatId
      );
    }

  }, [currentChatId]);


  // AUTO SCROLL
  useEffect(() => {

    messagesEndRef.current?.
      scrollIntoView({
        behavior: "smooth",
      });

  }, [messages]);


  // NEW CHAT
const createNewChat = () => {

  const newId = Date.now();

  const newChat = {
    id: newId,
    title: "New Chat",
    messages: [],
  };

  const updatedChats = [
    newChat,
    ...allChats,
  ];

  setAllChats(updatedChats);

  setCurrentChatId(newId);

  setMessages([]);

  localStorage.setItem(
    "all-ai-chats",
    JSON.stringify(updatedChats)
  );

  localStorage.setItem(
    "active-chat-id",
    newId.toString()
  );

  setMessage("");
  setSelectedImage(null);
};


  // DELETE CHAT
  const deleteChat = (
    chatId
  ) => {

    const updatedChats =
      allChats.filter(
        (chat) =>
          chat.id !==
          chatId
      );

    setAllChats(
      updatedChats
    );

    localStorage.setItem(
      "all-ai-chats",

      JSON.stringify(
        updatedChats
      )
    );

    // ACTIVE CHAT DELETE
    if (
      currentChatId ===
      chatId
    ) {

      if (
        updatedChats.length > 0
      ) {

        setCurrentChatId(
          updatedChats[0].id
        );

        setMessages(
          updatedChats[0]
            .messages
        );

      } else {

        setCurrentChatId(
          null
        );

        setMessages([]);
      }
    }
  };

  // SEND MESSAGE
 const sendMessage = async () => {
console.log("currentChatId:", currentChatId);
  if (!currentChatId) {
    alert("Please click New Chat first");
    return;
  }

  if (
    !message.trim() &&
    !selectedImage
  ) return;

  const currentMessage = message;

  const userMessage = {
    role: "user",
    content: currentMessage,
    image: selectedImage?.preview,
  };

  const updatedUserMessages = [
    ...messages,
    userMessage,
  ];

  setMessages(updatedUserMessages);

  setMessage("");
  setSelectedImage(null);
  setLoading(true);

  try {

   const API_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:5000/chat"
    : "https://ai-demo-api-b2z5.onrender.com/chat";

const response = await fetch(API_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
 body: JSON.stringify({
  messages: updatedUserMessages,
}),
});

    const data =
      await response.json();

    const aiMessage = {
      role: "assistant",
      content: data.reply,
    };

    const updatedMessages = [
      ...updatedUserMessages,
      aiMessage,
    ];

    setMessages(updatedMessages);

    setAllChats((prev) => {

      const newTitle =
        currentMessage
          .trim()
          .slice(0, 30) ||
        "New Chat";

      return prev.map((chat) => {

        if (
          chat.id ===
          currentChatId
        ) {

          return {
            ...chat,

            title:
              chat.title ===
              "New Chat"
                ? newTitle
                : chat.title,

            messages:
              updatedMessages,
          };
        }

        return chat;
      });
    });

  } catch (error) {

    console.log(error);

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content:
          "Error fetching response",
      },
    ]);
  }

  setLoading(false);
};

  // ENTER
  const handleKeyDown = (e) => {

    if (
      e.key === "Enter" &&
      e.shiftKey
    ) {
      return;
    }

    if (e.key === "Enter") {

      e.preventDefault();

      sendMessage();
    }
  };


  // VOICE INPUT
  const startVoice = () => {

    const SpeechRecognition =

      window.SpeechRecognition ||

      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {

      alert(
        "Voice not supported"
      );

      return;
    }

    const recognition =
      new SpeechRecognition();

    recognition.start();

    recognition.onresult =
      (event) => {

        const transcript =
          event.results[0][0]
            .transcript;

        setMessage(transcript);
      };
  };


  // COPY CODE
  const copyCode = async (
    text
  ) => {

    await navigator.clipboard.writeText(
      text
    );

    alert(
      "Code Copied!"
    );
  };


  // IMAGE UPLOAD
  const handleImage = (e) => {

    const file =
      e.target.files[0];

    if (!file) return;

    const imageUrl =
      URL.createObjectURL(file);

    setSelectedImage({

      file,

      preview: imageUrl,
    });
  };


  // IMAGE PASTE
  const handlePaste = (e) => {

    const items =
      e.clipboardData.items;

    for (
      let i = 0;
      i < items.length;
      i++
    ) {

      if (
        items[i].type.includes(
          "image"
        )
      ) {

        const file =
          items[i].getAsFile();

        const imageUrl =
          URL.createObjectURL(file);

        setSelectedImage({

          file,

          preview: imageUrl,
        });
      }
    }
  };


  // DRAG DROP
  const handleDrop = (e) => {

    e.preventDefault();

    const file =
      e.dataTransfer.files[0];

    if (!file) return;

    const imageUrl =
      URL.createObjectURL(file);

    setSelectedImage({

      file,

      preview: imageUrl,
    });
  };


  return (

    <div
      className="app"

      onDragOver={(e) =>
        e.preventDefault()
      }

      onDrop={handleDrop}
    >


      {/* SIDEBAR */}
      <div className="sidebar">

        <button
          className="new-chat-btn"

          onClick={createNewChat}
        >
          + New Chat
        </button>

        <h3 className="recentChat">
          Recent Chat
        </h3>


        <div className="chat-history">

          {
            allChats.map((chat) => (

              <div
                key={chat.id}

                className={
                  currentChatId ===
                    chat.id

                    ? "history-item active"

                    : "history-item"
                }
              >

                <span

                  className="chat-title"

                  onClick={() => {

                    setCurrentChatId(
                      chat.id
                    );

                    setMessages(
                      chat.messages
                    );

                    localStorage.setItem(
                      "active-chat-id",

                      chat.id
                    );
                  }}
                >

                  {chat.title}

                </span>


                <button
                  className=
                  "delete-chat-btn"

                  onClick={() =>
                    deleteChat(
                      chat.id
                    )
                  }
                >

                  <FaTrash />

                </button>

              </div>
            ))
          }

        </div>

      </div>

      {/* MAIN CHAT */}
      <div className="chat-container">


        {/* HEADER */}
        <div className="header">
          AI Assistant
        </div>


        {/* MESSAGES */}
        <div className="messages">

          {
            messages.map(
              (msg, index) => (

                <div
                  key={index}

                  className={
                    msg.role === "user"
                      ? "message user"
                      : "message ai"
                  }
                >

                  {
                    msg.image && (

                      <img
                        src={msg.image}

                        alt="upload"

                        className="chat-image"
                      />
                    )
                  }


                  {
                    msg.content && (

                      <div className="message-content">

                        {

                          msg.content?.includes(

                          )

                            ? msg.content
                              .split(
                                "```"
                              )
                              .map(
                                (
                                  part,
                                  index
                                ) => {

                                  if (
                                    index %
                                    2 !==
                                    0
                                  ) {

                                    return (

                                      <div
                                        key={index}

                                        className="code-wrapper"
                                      >

                                        <div className="code-header">

                                          <span>
                                            Code
                                          </span>

                                          <button
                                            className="copy-btn"

                                            onClick={() =>
                                              copyCode(
                                                part
                                              )
                                            }
                                          >
                                            <FaCopy />
                                          </button>

                                        </div>

                                        <pre className="code-block">

                                          <code>
                                            {part}
                                          </code>

                                        </pre>

                                      </div>
                                    );
                                  }

                                  return (
                                    <p key={index}>
                                      {part}
                                    </p>
                                  );
                                }
                              )

                            : (
                              <p>
                                {msg.content}
                              </p>
                            )
                        }

                      </div>
                    )
                  }

                </div>
              )
            )
          }


          {
            loading && (

              <div className="message ai">
                <p>
                  Typing...
                </p>
              </div>
            )
          }

          <div
            ref={messagesEndRef}
          ></div>

        </div>


        {/* INPUT */}
        <div className="input-box">


          {
            selectedImage && (

              <div className="preview-box">

                <img
                  src={
                    selectedImage.preview
                  }

                  alt="preview"
                />

                <button
                  className=
                  "remove-image"

                  onClick={() =>
                    setSelectedImage(
                      null
                    )
                  }
                >
                  ✕
                </button>

              </div>
            )
          }


          {/* IMAGE */}
          <button
            onClick={() =>
              fileInputRef.current.click()
            }
          >
            <FaImage />
          </button>

          <input
            type="file"

            hidden

            ref={fileInputRef}

            onChange={
              handleImage
            }
          />


          {/* TEXTAREA */}
          <textarea

            placeholder=
            "Ask anything..."

            value={message}

            onPaste={
              handlePaste
            }

            style={{
              height: "50px",
            }}

            onChange={(e) => {

              setMessage(
                e.target.value
              );

              e.target.style.height =
                "50px";

              e.target.style.height =
                e.target.scrollHeight +
                "px";
            }}

            onKeyDown={
              handleKeyDown
            }

            rows="1"

            className=
            "chat-textarea"
          />


          {/* VOICE */}
          <button
            onClick={
              startVoice
            }
          >
            <FaMicrophone />
          </button>


          {/* SEND */}
          <button
            onClick={
              sendMessage
            }
          >
            <FaPaperPlane />
          </button>

        </div>

      </div>

    </div>
  );
}

export default App;

