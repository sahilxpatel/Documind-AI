import { motion } from 'framer-motion';
import { ArrowRight, FileText, Bot, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

const Landing = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-500/30 overflow-hidden relative font-sans">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 flex justify-center items-center overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-300/30 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-purple-300/30 blur-[120px]" />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 container mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <FileText className="text-white w-6 h-6" />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">DocuMind AI</span>
        </div>
        <div className="flex items-center gap-6">
          <Link to="/login" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">Sign In</Link>
          <Link to="/dashboard" className="px-5 py-2.5 rounded-full bg-white/70 hover:bg-white border border-slate-200/50 shadow-sm backdrop-blur-md transition-all text-sm font-medium text-indigo-600 hover:shadow-md hover:-translate-y-0.5">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 container mx-auto px-6 pt-32 pb-24 text-center flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 border border-slate-200/50 shadow-sm text-indigo-600 text-sm font-medium mb-8 backdrop-blur-md"
        >
          <span className="flex w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
          DocuMind AI 1.0 is now live
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
          className="text-6xl md:text-8xl font-bold tracking-tight mb-8 leading-tight max-w-5xl"
        >
          Give your documents <br className="hidden md:block"/> 
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500">superpowers.</span>
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="text-lg md:text-xl text-slate-500 max-w-2xl mb-12 leading-relaxed"
        >
          Upload PDFs, generate AI summaries, search semantically, and chat directly with your documents. Built for speed and scale on Azure.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          className="flex flex-col sm:flex-row items-center gap-4"
        >
          <Link to="/dashboard" className="px-8 py-4 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-xl shadow-indigo-500/20">
            Try it for free <ArrowRight className="w-5 h-5" />
          </Link>
          <button className="px-8 py-4 rounded-full bg-white/50 hover:bg-white border border-slate-200 text-slate-700 font-medium transition-all backdrop-blur-sm shadow-sm hover:shadow-md">
            View Documentation
          </button>
        </motion.div>

        {/* Feature Cards */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.6, ease: "easeOut" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-32 max-w-6xl w-full text-left"
        >
          <div className="p-8 rounded-3xl bg-white/60 border border-slate-200/50 shadow-xl shadow-slate-200/40 backdrop-blur-xl hover:bg-white transition-all group hover:-translate-y-1">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-sm">
              <Bot className="w-7 h-7 text-indigo-600" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-slate-900">AI Chat</h3>
            <p className="text-slate-500 leading-relaxed">Ask questions and extract insights directly from your uploaded documents using state-of-the-art Azure OpenAI models.</p>
          </div>
          <div className="p-8 rounded-3xl bg-white/60 border border-slate-200/50 shadow-xl shadow-slate-200/40 backdrop-blur-xl hover:bg-white transition-all group hover:-translate-y-1">
            <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-sm">
              <Search className="w-7 h-7 text-purple-600" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-slate-900">Semantic Search</h3>
            <p className="text-slate-500 leading-relaxed">Find exactly what you're looking for with Azure AI Search, combining keyword and vector semantic search capabilities.</p>
          </div>
          <div className="p-8 rounded-3xl bg-white/60 border border-slate-200/50 shadow-xl shadow-slate-200/40 backdrop-blur-xl hover:bg-white transition-all group hover:-translate-y-1">
            <div className="w-14 h-14 rounded-2xl bg-pink-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-sm">
              <FileText className="w-7 h-7 text-pink-600" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-slate-900">Auto-Summarization</h3>
            <p className="text-slate-500 leading-relaxed">Every document is automatically processed in the background by Azure Functions to generate concise summaries.</p>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default Landing;
