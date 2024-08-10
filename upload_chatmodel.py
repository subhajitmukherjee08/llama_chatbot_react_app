import mysql.connector
from mysql.connector import Error
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import shutil
from langchain_community.vectorstores import FAISS
# from langchain.vectorstores import FAISS
# from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_huggingface import HuggingFaceEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.chains import ConversationalRetrievalChain
from langchain_community.document_loaders import PyPDFLoader, DirectoryLoader
from langchain_community.llms import CTransformers
# from langchain.llms import CTransformers
from langchain.memory import ConversationBufferMemory
from langchain.chains import RetrievalQAWithSourcesChain
from langchain.prompts.chat import (
    ChatPromptTemplate,
    SystemMessagePromptTemplate,
    HumanMessagePromptTemplate,
)
app = Flask(__name__)
CORS(app)
def create_connection():
    connection = None
    try:
        connection = mysql.connector.connect(
            host='localhost',
            database='chatbot',
            user='subhajitdb',
            password='subhajitdb2002'
        )
        print("Connected to MySQL database")
    except Error as e:
        print(f"Error connecting to MySQL database: {e}")
    return connection

UPLOAD_FOLDER = 'books'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
class PDFChatBot:

    def __init__(self):
        self.data_path = os.path.join('books')
        self.db_faiss_path = os.path.join('vector', 'db_faiss')
        #self.chat_prompt = PromptTemplate(template=chat_prompt, input_variables=['context', 'question'])
        #self.CONDENSE_QUESTION_PROMPT=CONDENSE_QUESTION_PROMPT

    def create_vector_db(self):

        '''function to create vector db provided the pdf files'''

        loader = DirectoryLoader(self.data_path,
                             glob='*.pdf',
                             loader_cls=PyPDFLoader)

        documents = loader.load()
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=400,
                                                   chunk_overlap=50)
        texts = text_splitter.split_documents(documents)

        embeddings = HuggingFaceEmbeddings(model_name='sentence-transformers/all-MiniLM-L6-v2',
                                       model_kwargs={'device': 'cpu'})

        db = FAISS.from_documents(texts, embeddings)
        db.save_local(self.db_faiss_path)

    def load_llm(self):
        # Load the locally downloaded model here
        llm = CTransformers(
            model="./models/llama-2-7b-chat.ggmlv3.q8_0.bin",
            model_type="llama",
            max_new_tokens=2000,
            temperature=0.5
        )
        return llm

    def conversational_chain(self):

        embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2",
                                           model_kwargs={'device': 'cpu'})
        db = FAISS.load_local(self.db_faiss_path, embeddings,allow_dangerous_deserialization=True)
        # initializing the conversational chain
        memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)
        conversational_chain = ConversationalRetrievalChain.from_llm( llm=self.load_llm(),
                                                                      retriever=db.as_retriever(search_kwargs={"k": 3}),
                                                                      verbose=True,
                                                                      memory=memory
                                                                      )
        system_template="""Only answer questions related to the following pieces of text.\n- Strictly not answer the question if user asked question is not present in the below text.
        Take note of the sources and include them in the answer in the format: "\nSOURCES: source1 \nsource2", use "SOURCES" in capital letters regardless of the number of sources.
        If you don't know the answer, just say that "I don't know", don't try to make up an answer.
        ----------------
        {summaries}"""
        messages = [
            SystemMessagePromptTemplate.from_template(system_template),
            HumanMessagePromptTemplate.from_template("{question}")
        ]
        prompt = ChatPromptTemplate.from_messages(messages)

        chain_type_kwargs = {"prompt": prompt}        
        conversational_chain1 = RetrievalQAWithSourcesChain.from_chain_type(
            llm=self.load_llm(),
            chain_type="stuff",
            retriever=db.as_retriever(search_kwargs={"k": 3}),
            return_source_documents=True
            #chain_type_kwargs=chain_type_kwargs
        )        

        return conversational_chain

chatbot = None
@app.route('/ask', methods=['POST'])
def ask_question():
    global chatbot
    if chatbot is None:
        return jsonify({'error': 'Chatbot not initialized. Please initialize first.'}), 500

    data = request.json
    print("Received data:", data)
    if 'question' not in data:
        return jsonify({'error': 'Question not provided.'}), 400

    question = data['question']
    result = chatbot.conversational_chain()({"question": question})
    answer = result.get('answer', '')

    # Save the question and answer to the chat_history table
    connection = create_connection()
    if connection:
        try:
            cursor = connection.cursor()
            sql_insert_query = "INSERT INTO chat_history (question, answer) VALUES (%s, %s)"
            cursor.execute(sql_insert_query, (question, answer))
            connection.commit()
            print("Chat history saved to MySQL database")
        except Error as e:
            print(f"Error inserting chat history into MySQL database: {e}")
        finally:
            if connection.is_connected():
                cursor.close()
                connection.close()
                print("MySQL connection closed")

    serializable_result = {
        'answer': answer,
        'source_documents': result.get('source_documents', []),
    }

    return jsonify(serializable_result)


@app.route('/initialize', methods=['POST'])
def initialize_chatbot():
    global chatbot
    print("Wait for a minute.")
    chatbot = PDFChatBot()
    chatbot.create_vector_db()
    return jsonify({'message': 'Chatbot initialized successfully!'})

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'})
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No selected file'})

    file_path = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
    file.save(file_path)

    connection = create_connection()
    if connection:
        try:
            cursor = connection.cursor()
            # Check if the file name already exists in the database
            sql_check_query = "SELECT COUNT(*) FROM books WHERE book_path = %s"
            cursor.execute(sql_check_query, (file_path,))
            count = cursor.fetchone()[0]

            if count == 0:
                # Insert the file path into the database if it doesn't already exist
                sql_insert_query = "INSERT INTO books (book_path) VALUES (%s)"
                cursor.execute(sql_insert_query, (file_path,))
                connection.commit()
                message = "File uploaded and path saved to MySQL database"
            else:
                message = "File already exists in the database"

            print(message)
        except Error as e:
            print(f"Error inserting file path into MySQL database: {e}")
            return jsonify({'error': 'Error inserting file path into MySQL database'}), 500
        finally:
            if connection.is_connected():
                cursor.close()
                connection.close()
                print("MySQL connection closed")
    else:
        print("Failed to connect to MySQL database")
        return jsonify({'error': 'Failed to connect to MySQL database'}), 500

    return jsonify({'message': message})


@app.route('/pdf-files', methods=['GET'])
def get_pdf_files():
    connection = create_connection()
    pdf_files = []

    if connection:
        try:
            cursor = connection.cursor()
            sql_query = "SELECT book_path FROM books"
            cursor.execute(sql_query)
            pdf_files = [row[0] for row in cursor.fetchall()]
        except Error as e:
            print(f"Error fetching PDF files from MySQL database: {e}")
        finally:
            if connection.is_connected():
                cursor.close()
                connection.close()
                print("MySQL connection closed")

    return jsonify(pdf_files)

@app.route('/chat-history', methods=['GET'])
def get_chat_history():
    connection = create_connection()
    chat_history = []

    if connection:
        try:
            cursor = connection.cursor()
            sql_query = "SELECT question, answer, created_at FROM chat_history ORDER BY created_at DESC"
            cursor.execute(sql_query)
            result = cursor.fetchall()
            chat_history = [{'question': row[0], 'answer': row[1], 'created_at': row[2]} for row in result]
        except Error as e:
            print(f"Error fetching chat history from MySQL database: {e}")
        finally:
            if connection.is_connected():
                cursor.close()
                connection.close()
                print("MySQL connection closed")

    return jsonify(chat_history)

@app.route('/delete', methods=['POST'])
def delete_file():
    data = request.json
    if 'file_path' not in data:
        return jsonify({'error': 'File path not provided.'}), 400

    file_path = data['file_path']
    vector_path = os.path.join('vector', 'db_faiss')  # Adjust if your vector path is different

    try:
        # Delete the PDF file
        if os.path.exists(file_path):
            os.remove(file_path)
        else:
            return jsonify({'error': 'File not found.'}), 404

        # Delete the vector files related to the PDF (customize this as per your vector storage)
        if os.path.exists(vector_path):
            shutil.rmtree(vector_path)

        # Remove file path from MySQL database
        connection = create_connection()
        if connection:
            try:
                cursor = connection.cursor()
                sql_query = "DELETE FROM books WHERE book_path = %s"
                cursor.execute(sql_query, (file_path,))
                connection.commit()
                print("File path removed from MySQL database")
            except Error as e:
                print(f"Error deleting file path from MySQL database: {e}")
            finally:
                if connection.is_connected():
                    cursor.close()
                    connection.close()
                    print("MySQL connection closed")
        else:
            print("Failed to connect to MySQL database")

        return jsonify({'message': 'File and vectors deleted successfully.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/delete-chat', methods=['DELETE'])
def delete_chat():
    data = request.json
    question = data.get('question')
    if not question:
        return jsonify({'error': 'Question not provided'}), 400

    connection = create_connection()
    if connection:
        try:
            cursor = connection.cursor()
            sql_query = "DELETE FROM chat_history WHERE question = %s"
            cursor.execute(sql_query, (question,))
            connection.commit()
            if cursor.rowcount > 0:
                print(f"Chat message with question '{question}' deleted successfully")
                return jsonify({'message': f"Chat message with question '{question}' deleted successfully"}), 200
            else:
                print(f"No chat message found with question '{question}'")
                return jsonify({'error': 'Chat message not found'}), 404
        except Error as e:
            print(f"Error deleting chat message: {e}")
            return jsonify({'error': 'Internal server error occurred'}), 500
        finally:
            if connection.is_connected():
                cursor.close()
                connection.close()
                print("MySQL connection closed")
    else:
        print("Failed to connect to MySQL database")
        return jsonify({'error': 'Failed to connect to MySQL database'}), 500




if __name__ == '__main__':
    app.run(debug=True)