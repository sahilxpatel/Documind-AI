import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Search as SearchIcon, Settings, LogOut, MessageSquare, Loader2, Menu, X, CloudUpload } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import toast from 'react-hot-toast';
import GlobalSearch from '../components/GlobalSearch';

interface Document {
  id: string;
  title: string;
  status: 'UPLOADED' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  summary: string | null;
  createdAt: string;
}

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('documents');
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  
  // New States
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = async () => {
    try {
      const res = await apiClient.get('/api/documents');
      setDocuments(res.data.documents);
    } catch (error) {
      console.error('Failed to fetch documents', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleFile = async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      toast.error('Please upload a valid PDF file.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    const toastId = toast.loading('Uploading document...');

    try {
      await apiClient.post('/api/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Document uploaded successfully!', { id: toastId });
      fetchDocuments();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Upload failed', { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const handleUploadClick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-emerald-50 text-emerald-600 border-emerald-100/50';
      case 'FAILED': return 'bg-red-50 text-red-600 border-red-100/50';
      case 'PROCESSING': return 'bg-indigo-50 text-indigo-600 border-indigo-100/50 animate-pulse';
      case 'QUEUED': return 'bg-amber-50 text-amber-600 border-amber-100/50';
      default: return 'bg-slate-50 text-slate-600 border-slate-200/50';
    }
  };

  const SkeletonCard = () => (
    <div className="bg-white/60 backdrop-blur-md p-6 rounded-3xl border border-slate-200/50 animate-pulse flex flex-col h-64">
      <div className="flex justify-between items-start mb-5">
        <div className="w-12 h-12 bg-slate-200 rounded-2xl"></div>
        <div className="w-20 h-6 bg-slate-200 rounded-full"></div>
      </div>
      <div className="w-3/4 h-6 bg-slate-200 rounded mb-4"></div>
      <div className="w-full h-4 bg-slate-200 rounded mb-2"></div>
      <div className="w-5/6 h-4 bg-slate-200 rounded mb-6 flex-1"></div>
      <div className="flex justify-between mt-auto pt-5 border-t border-slate-200/60">
        <div className="w-16 h-6 bg-slate-200 rounded"></div>
        <div className="w-24 h-6 bg-slate-200 rounded"></div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 flex justify-center items-center overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-200/40 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-purple-200/40 blur-[120px]" />
      </div>

      {/* Mobile Header */}
      <div className="md:hidden absolute top-0 left-0 w-full p-4 flex items-center justify-between z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
            <FileText className="text-white w-4 h-4" />
          </div>
          <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">DocuMind</span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-slate-600">
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar - Responsive */}
      <AnimatePresence>
        {(mobileMenuOpen || window.innerWidth >= 768) && (
          <motion.aside 
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            className={`fixed md:relative top-0 left-0 h-full w-72 glass-panel border-y-0 border-l-0 flex flex-col z-40 shadow-2xl shadow-slate-200/50 ${mobileMenuOpen ? 'block' : 'hidden md:flex'}`}
          >
            <div className="p-6 hidden md:flex items-center gap-3 border-b border-slate-200/50">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <FileText className="text-white w-5 h-5" />
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">DocuMind AI</span>
            </div>

            <nav className="flex-1 p-4 space-y-2 mt-16 md:mt-0">
              <button 
                onClick={() => { setActiveTab('documents'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${activeTab === 'documents' ? 'bg-white shadow-sm border border-slate-200/50 text-indigo-600 font-medium' : 'text-slate-500 hover:bg-white/50 hover:text-slate-900'}`}
              >
                <FileText className="w-5 h-5" />
                My Documents
              </button>
              <button 
                onClick={() => { setActiveTab('search'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${activeTab === 'search' ? 'bg-white shadow-sm border border-slate-200/50 text-indigo-600 font-medium' : 'text-slate-500 hover:bg-white/50 hover:text-slate-900'}`}
              >
                <SearchIcon className="w-5 h-5" />
                Global Search
              </button>
              <button 
                onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${activeTab === 'settings' ? 'bg-white shadow-sm border border-slate-200/50 text-indigo-600 font-medium' : 'text-slate-500 hover:bg-white/50 hover:text-slate-900'}`}
              >
                <Settings className="w-5 h-5" />
                Settings
              </button>
            </nav>

            <div className="p-4 border-t border-slate-200/50">
              <button 
                onClick={() => { logout(); navigate('/login'); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative z-10 pt-16 md:pt-0">
        <div className="max-w-6xl mx-auto p-4 sm:p-8 lg:p-12">
          {activeTab === 'search' ? (
            <GlobalSearch />
          ) : (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <header className="mb-10 text-center sm:text-left">
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">My Documents</h1>
                <p className="text-slate-500 mt-2 text-lg">Manage and chat with your uploaded files.</p>
              </header>

              {/* Drag and Drop Zone */}
              <div 
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`mb-12 border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all ${
                  dragActive ? 'border-indigo-500 bg-indigo-50/50 scale-[1.02]' : 'border-slate-300 bg-white/40 hover:bg-white/60 hover:border-indigo-400'
                } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <input 
                  ref={inputRef}
                  type="file" 
                  accept="application/pdf" 
                  className="hidden" 
                  onChange={handleUploadClick}
                  disabled={uploading}
                />
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  {uploading ? <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /> : <CloudUpload className="w-8 h-8 text-indigo-600" />}
                </div>
                <h3 className="text-xl font-semibold text-slate-800 mb-1">
                  {uploading ? 'Uploading your document...' : 'Click or drag PDF to upload'}
                </h3>
                <p className="text-slate-500 text-sm">Maximum file size 10MB</p>
              </div>

              {/* Document Grid */}
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-20 text-slate-500 glass-panel rounded-3xl border border-dashed border-slate-300">
                  <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <FileText className="w-10 h-10 text-indigo-400" />
                  </div>
                  <h3 className="text-xl font-medium text-slate-700 mb-2">No documents yet</h3>
                  <p>Upload your first PDF to get started with AI superpowers!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {documents.map((doc, i) => (
                    <motion.div 
                      key={doc.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="bg-white/60 backdrop-blur-md p-6 rounded-3xl shadow-sm border border-slate-200/50 hover:shadow-xl hover:shadow-slate-200/50 hover:bg-white transition-all group relative overflow-hidden flex flex-col hover:-translate-y-1"
                    >
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />
                      
                      <div className="flex justify-between items-start mb-5">
                        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 flex-shrink-0 shadow-inner">
                          <FileText className="w-6 h-6" />
                        </div>
                        <span className={`px-3 py-1.5 text-xs font-bold rounded-full border tracking-wide uppercase ${getStatusBadge(doc.status)}`}>
                          {doc.status}
                        </span>
                      </div>
                      
                      <h3 className="text-xl font-bold mb-2 truncate text-slate-900 group-hover:text-indigo-600 transition-colors" title={doc.title}>
                        {doc.title}
                      </h3>
                      
                      <p className="text-sm text-slate-500 mb-6 line-clamp-2 flex-1 leading-relaxed">
                        {doc.summary || 'Summary will appear here once processing is complete.'}
                      </p>
                      
                      <div className="flex items-center justify-between border-t border-slate-200/60 pt-5 mt-auto">
                        <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </span>
                        
                        <div className="flex items-center gap-3 sm:gap-4">
                          <Link to={`/documents/${doc.id}`} className="text-slate-500 text-sm font-semibold hover:text-indigo-600 transition-colors">
                            View
                          </Link>
                          <Link to={`/documents/${doc.id}/chat`} className="text-indigo-600 text-sm font-semibold flex items-center gap-1.5 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                            <MessageSquare className="w-4 h-4" /> Chat
                          </Link>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </main>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30 md:hidden"
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
