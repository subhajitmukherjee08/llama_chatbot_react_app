import './App.css';
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [theme, setTheme] = useState('theme1');
  const [question, setQuestion] = useState('');
  const [file, setFile] = useState(null);
  const [answer, setAnswer] = useState('');
  const [pdfFiles, setPdfFiles] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState(''); // New state for status messages

  useEffect(() => {
    fetchPdfFiles();
    fetchChatHistory();
  }, []);

  const fetchPdfFiles = async () => {
    try {
      const response = await axios.get('http://localhost:5000/pdf-files');
      setPdfFiles(response.data);
    } catch (error) {
      setError('Error fetching PDF files: ' + error.message);
    }
  };

  const fetchChatHistory = async () => {
    try {
      const response = await axios.get('http://localhost:5000/chat-history');
      setChatHistory(response.data);
    } catch (error) {
      setError('Error fetching chat history: ' + error.message);
    }
  };

  const handleInitialize = async () => {
    try {
      setStatusMessage('Initializing chatbot. Please wait for a moment...');
      const response = await axios.post('http://localhost:5000/initialize');
      setStatusMessage(response.data.message);
    } catch (error) {
      setError('Error initializing PDFChatBot: ' + error.message);
    }
  };

  const handleAskQuestion = async () => {
    try {
      setStatusMessage('Generating answer. Please wait for a moment...');
      const response = await axios.post('http://localhost:5000/ask', { question });
      setAnswer(response.data.answer);
      fetchChatHistory();
      setStatusMessage(''); // Clear status message after getting the answer
    } catch (error) {
      setError('Error asking question: ' + error.message);
      setAnswer('Error asking question. Please try again.');
      setStatusMessage(''); // Clear status message on error
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    setFile(file);
  };

  const handleUpload = async () => {
    try {
      setStatusMessage('Uploading file. Please wait for a moment...');
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post('http://localhost:5000/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      setStatusMessage('File uploaded successfully');
      fetchPdfFiles();
    } catch (error) {
      setError('Error uploading file: ' + error.message);
    }
  };

  const handleDelete = async (filePath) => {
    try {
      setStatusMessage('Deleting file. Please wait for a moment...');
      const response = await axios.post('http://localhost:5000/delete', { file_path: filePath });
      setStatusMessage('File deleted successfully');
      fetchPdfFiles();
    } catch (error) {
      setError('Error deleting file: ' + error.message);
    }
  };

  const handleDeleteChat = async (question) => {
    try {
      setStatusMessage('Deleting chat message. Please wait for a moment...');
      const response = await axios.delete('http://localhost:5000/delete-chat', { data: { question } });
      if (response.status === 200) {
        setStatusMessage(response.data.message);
        setChatHistory(chatHistory.filter(chat => chat.question !== question));
      } else {
        setError(response.data.error);
      }
    } catch (error) {
      setError('Error deleting chat message: ' + error.message);
    }
  };

  const changeTheme = (theme) => {
    setTheme(theme);
    document.documentElement.className = theme;
  };

  return (
    <div className={`App ${theme}`}>
      <div className={`sidebar ${theme}`}>
        <h1>Upload required pdf files here</h1>
        <div className="file-upload-section">
          <input className="file-input" type="file" onChange={handleFileUpload} />
          <button className="btn-primary" onClick={handleUpload}>Upload</button>

          <h2>List of PDF Files</h2>
          <ul className="pdf-list">
            {pdfFiles.map((pdfFile, index) => (
              <li key={index} className="pdf-list-item">
                <div className="pdf-item-container">
                  <div className="pdf-name" title={pdfFile.split('/').pop()}>
                    {pdfFile.split('/').pop()}
                  </div>
                  <button className="btn-delete" onClick={() => handleDelete(pdfFile)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>

          <div className="theme-buttons">
            <h3>Choose your Theme:</h3>
            <button onClick={() => changeTheme('theme1')}>Theme 1</button>
            <button onClick={() => changeTheme('theme2')}>Theme 2</button>
            <button onClick={() => changeTheme('theme3')}>Theme 3</button>
          </div>
        </div>
      </div>
      <div className="main-content">
        <h1>Welcome to our Llama Chatbot</h1>
        <button className="btn-primary" onClick={handleInitialize}>Initialize PDFChatBot</button>
        <div className="question-section">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Enter your question..."
          />
          <button className="btn-primary" onClick={handleAskQuestion}>Ask</button>
        </div>
        {answer && <div className="answer-section"><strong>Answer:</strong> {answer}</div>}
        {error && <div className="error-section"><strong>Error:</strong> {error}</div>}
        {statusMessage && <div className="status-message-section"><strong>Status:</strong> {statusMessage}</div>}
        {/* New status message section */}
        <div className="chat-history">
          <h2>Chat History</h2>
          <ul>
            {chatHistory.map((chat, index) => (
              <li key={index}>
                <p><strong>Question:</strong> {chat.question}<br /></p>
                <p><strong>Answer:</strong> {chat.answer}<br /></p>
                <span className="timestamp">{new Date(chat.created_at).toLocaleString()}</span>
                <button className="btn-delete" onClick={() => handleDeleteChat(chat.question)}>Delete</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;
