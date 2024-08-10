import './App.css';
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [theme, setTheme] = useState('theme1');  //modified
  
  const [question, setQuestion] = useState('');
  const [file, setFile] = useState(null);
  const [answer, setAnswer] = useState('');
  const [pdfFiles, setPdfFiles] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);

  useEffect(() => {
    fetchPdfFiles();
    fetchChatHistory();
  }, []);

  const fetchPdfFiles = async () => {
    try {
      const response = await axios.get('http://localhost:5000/pdf-files');
      setPdfFiles(response.data);
    } catch (error) {
      console.error('Error fetching PDF files:', error);
    }
  };

  const fetchChatHistory = async () => {
    try {
      const response = await axios.get('http://localhost:5000/chat-history');
      setChatHistory(response.data);
    } catch (error) {
      console.error('Error fetching chat history:', error);
    }
  };

  const handleInitialize = async () => {
    try {
      const response = await axios.post('http://localhost:5000/initialize');
      console.log(response.data.message);
    } catch (error) {
      console.error('Error initializing PDFChatBot:', error);
    }
  };

  const handleAskQuestion = async () => {
    try {
      const response = await axios.post('http://localhost:5000/ask', { question });
      setAnswer(response.data.answer);
      fetchChatHistory();  // Fetch chat history after asking a question
    } catch (error) {
      console.error('Error asking question:', error);
      setAnswer('Error asking question. Please try again.');
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    setFile(file);
  };

  const handleUpload = async () => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post('http://localhost:5000/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      console.log('File uploaded successfully:', response.data);
      fetchPdfFiles();
    } catch (error) {
      console.error('Error uploading file:', error);
    }
  };

  const handleDelete = async (filePath) => {
    try {
      const response = await axios.post('http://localhost:5000/delete', { file_path: filePath });
      console.log('File deleted successfully:', response.data);
      fetchPdfFiles();
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  };

  const handleDeleteChat = async (question) => {
    try {
      const response = await axios.delete('http://localhost:5000/delete-chat', { data: { question } });
      if (response.status === 200) {
        console.log(response.data.message);
        setChatHistory(chatHistory.filter(chat => chat.question !== question));
      } else {
        console.error(response.data.error);
      }
    } catch (error) {
      console.error('Error deleting chat message:', error);
    }
  };

  //modified
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