import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send, Bot, User, Loader2, AlertCircle } from 'lucide-react';
import apiClient from '../api/client';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  createdAt: string;
}

const DocumentChat = () => {
  const { id } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await apiClient.get(`/api/chat/${id}`);
        const history = (res.data.messages || []).map((m: any) => ({
          id: m.id,
          role: m.role === 'USER' ? 'user' : 'ai',
          content: m.content,
          createdAt: m.createdAt,
        }));
        setMessages(history);
      } catch (err) {
        console.error('Failed to load chat history', err);
        setError('Failed to load conversation history.');
      } finally {
        setLoading(false);
        scrollToBottom();
      }
    };
    if (id) fetchHistory();
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      createdAt: new Date().toISOString()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await apiClient.post(`/api/chat/${id}`, { message: userMsg.content });
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: res.data.answer || res.data.message || 'No response',
        createdAt: new Date().toISOString()
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.error('Chat failed', err);
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: 'Sorry, I encountered an error answering your question. Please try again.',
        createdAt: new Date().toISOString()
      }]);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute inset-0 z-0 flex justify-center items-center overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-200/30 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-purple-200/30 blur-[120px]" />
      </div>

      {/* Header */}
      <header className="glass-panel border-b border-slate-200/60 px-6 py-4 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center gap-4">
          <Link to={`/documents/${id}`} className="p-2.5 rounded-full hover:bg-white/60 bg-white/40 border border-slate-200/50 shadow-sm text-slate-500 transition-all hover:scale-105 active:scale-95">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Document Chat</h1>
            <p className="text-sm text-slate-500 font-medium">Ask questions about your document.</p>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-6 relative z-10 scroll-smooth">
        <div className="max-w-4xl mx-auto space-y-8 pb-32">
          {error && (
            <div className="bg-red-50/80 backdrop-blur-md border border-red-100 text-red-600 p-4 rounded-2xl flex items-center gap-3 shadow-sm">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {messages.length === 0 ? (
            <div className="text-center py-20 sm:py-32 text-slate-500">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-tr from-indigo-100 to-purple-100 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-inner border border-indigo-50">
                <Bot className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-500" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">How can I help you?</p>
              <p className="text-sm sm:text-base text-slate-500">Ask me anything about this document.</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 sm:gap-4 group ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm ${
                  msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gradient-to-tr from-purple-100 to-indigo-50 text-indigo-600 border border-indigo-100/50'
                }`}>
                  {msg.role === 'user' ? <User className="w-4 h-4 sm:w-5 sm:h-5" /> : <Bot className="w-4 h-4 sm:w-5 sm:h-5" />}
                </div>
                
                <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl sm:rounded-[2rem] px-4 py-3 sm:px-6 sm:py-4 shadow-sm transition-all ${
                  msg.role === 'user' 
                    ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-tr-none shadow-indigo-500/20' 
                    : 'bg-white/80 backdrop-blur-md border border-slate-200/60 text-slate-800 rounded-tl-none hover:bg-white'
                }`}>
                  <p className="whitespace-pre-wrap leading-relaxed font-medium text-sm sm:text-base">{msg.content}</p>
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex gap-3 sm:gap-4">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-purple-100 to-indigo-50 border border-indigo-100/50 text-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Bot className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="bg-white/80 backdrop-blur-md border border-slate-200/60 rounded-2xl sm:rounded-[2rem] rounded-tl-none px-4 py-3 sm:px-6 sm:py-5 shadow-sm flex items-center gap-2">
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-indigo-400 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>
      </main>

      {/* Input Area */}
      <footer className="absolute bottom-0 w-full p-4 sm:p-6 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent z-20 pointer-events-none">
        <div className="max-w-4xl mx-auto relative pointer-events-auto">
          <form onSubmit={handleSend} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              className="w-full pl-5 sm:pl-6 pr-14 sm:pr-16 py-4 sm:py-5 bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-[2rem] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-xl shadow-slate-200/50 text-slate-800 font-medium placeholder:text-slate-400 text-sm sm:text-base"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="absolute right-2 sm:right-3 w-10 h-10 sm:w-12 sm:h-12 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-2xl sm:rounded-[1.5rem] flex items-center justify-center transition-all shadow-md active:scale-95 disabled:active:scale-100"
            >
              <Send className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5 sm:ml-1" />
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
};

export default DocumentChat;
