import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, MessageSquare, AlertCircle, Sparkles } from 'lucide-react';
import apiClient from '../api/client';
import { motion } from 'framer-motion';

interface DocumentDetail {
  id: string;
  title: string;
  status: string;
  summary: string | null;
  createdAt: string;
}

const DocumentDetail = () => {
  const { id } = useParams();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const res = await apiClient.get(`/api/documents`);
        const found = res.data.documents.find((d: any) => d.id === id);
        if (found) {
          setDoc(found);
        }
      } catch (error) {
        console.error('Failed to fetch document', error);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchDoc();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center justify-center text-center">
        <AlertCircle className="w-16 h-16 text-slate-400 mb-6" />
        <h2 className="text-2xl font-bold text-slate-900 mb-3">Document not found</h2>
        <Link to="/dashboard" className="text-indigo-600 hover:text-indigo-700 font-medium hover:underline">Return to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 relative overflow-hidden font-sans">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 flex justify-center items-center overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-indigo-200/30 blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-purple-200/30 blur-[120px]" />
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        <Link to="/dashboard" className="inline-flex items-center text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-8 transition-colors group">
          <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center mr-3 group-hover:shadow-md transition-all group-hover:-translate-x-1 border border-slate-200/60">
            <ArrowLeft className="w-4 h-4" />
          </div>
          Back to Documents
        </Link>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-[2rem] overflow-hidden"
        >
          <div className="p-8 md:p-10 border-b border-slate-200/60 flex flex-col md:flex-row items-start justify-between gap-6 bg-white/40">
            <div className="flex items-start gap-5">
              <div className="w-16 h-16 bg-gradient-to-tr from-indigo-50 to-purple-50 border border-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-inner">
                <FileText className="w-8 h-8" />
              </div>
              <div className="pt-1">
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3 tracking-tight">{doc.title}</h1>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`px-3 py-1.5 text-xs font-bold rounded-full border tracking-wide uppercase shadow-sm ${
                    doc.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600 border-emerald-200/60' :
                    doc.status === 'PROCESSING' ? 'bg-indigo-50 text-indigo-600 border-indigo-200/60 animate-pulse' :
                    doc.status === 'FAILED' ? 'bg-red-50 text-red-600 border-red-200/60' :
                    'bg-slate-50 text-slate-600 border-slate-200/60'
                  }`}>
                    {doc.status}
                  </span>
                  <span className="text-sm font-medium text-slate-400 bg-white/60 px-3 py-1.5 rounded-full border border-slate-200/60 shadow-sm">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
            
            <Link 
              to={`/documents/${doc.id}/chat`}
              className="w-full md:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-semibold flex justify-center items-center gap-2 shadow-xl shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95"
            >
              <MessageSquare className="w-5 h-5" /> Start Chat
            </Link>
          </div>

          <div className="p-8 md:p-12 bg-white/60">
            <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                <Sparkles className="w-5 h-5" />
              </div>
              AI Summary
            </h2>
            
            {doc.status === 'COMPLETED' ? (
              <div className="prose prose-slate prose-lg max-w-none">
                <p className="text-slate-600 leading-relaxed whitespace-pre-wrap font-medium">
                  {doc.summary || "No summary available."}
                </p>
              </div>
            ) : doc.status === 'FAILED' ? (
              <div className="bg-red-50 p-8 rounded-2xl border border-red-100 text-center">
                <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
                <p className="text-red-800 font-semibold text-lg">Processing Failed</p>
                <p className="text-red-600 mt-2">There was an error generating the summary for this document.</p>
              </div>
            ) : (
              <div className="bg-white/50 backdrop-blur-md p-10 rounded-3xl text-center border border-slate-200/60 shadow-sm">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mx-auto mb-4" />
                <p className="text-slate-700 font-semibold text-lg">Processing document...</p>
                <p className="text-slate-500 mt-2">Azure AI is generating the summary. This will just take a moment.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default DocumentDetail;
