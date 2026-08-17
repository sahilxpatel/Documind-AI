import { useState, useEffect } from 'react';
import { Search as SearchIcon, Loader2, FileText, ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';
import { motion } from 'framer-motion';

interface SearchResult {
  id: string;
  documentId: string;
  content: string;
  '@search.score': number;
}

const GlobalSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        setSearched(false);
        return;
      }
      
      setLoading(true);
      try {
        const res = await apiClient.get(`/api/search?q=${encodeURIComponent(query)}`);
        setResults(res.data.results || []);
      } catch (error) {
        console.error('Search failed', error);
        setResults([]);
      } finally {
        setLoading(false);
        setSearched(true);
      }
    }, 500); // 500ms debounce delay

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Search is handled by useEffect debounce, but we keep this to prevent page reload on enter
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.4 }}
      className="max-w-4xl mx-auto font-sans relative z-10"
    >
      <header className="mb-10 text-center">
        <div className="inline-flex items-center justify-center p-3 bg-purple-100 text-purple-600 rounded-2xl mb-4 shadow-sm">
          <Sparkles className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-3 tracking-tight">Global Search</h1>
        <p className="text-slate-500 text-lg">Semantic search across all your processed documents.</p>
      </header>

      <form onSubmit={handleSearch} className="relative mb-12 group">
        <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
          <SearchIcon className="h-6 w-6 text-indigo-400 group-focus-within:text-indigo-600 transition-colors" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What are you looking for? (Search as you type)"
          className="block w-full pl-16 pr-36 py-5 border border-slate-200/80 rounded-full leading-5 bg-white/80 backdrop-blur-xl shadow-xl shadow-slate-200/50 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-lg font-medium text-slate-800 transition-all"
        />
        <div className="absolute inset-y-2.5 right-3">
          <div className="flex items-center justify-center w-32 py-3 bg-indigo-50 text-indigo-600 font-semibold rounded-full shadow-inner border border-indigo-100">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="text-sm">Auto-searching</span>}
          </div>
        </div>
      </form>

      {/* Results Area */}
      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
        </div>
      ) : searched && results.length === 0 ? (
        <div className="text-center py-24 glass-panel rounded-3xl border border-dashed border-slate-300">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <SearchIcon className="w-10 h-10 text-slate-400" />
          </div>
          <p className="text-xl font-medium text-slate-700">No results found for "{query}"</p>
          <p className="text-slate-500 mt-2">Try adjusting your search terms.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {results.map((result, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              key={result.id} 
              className="bg-white/60 backdrop-blur-md p-8 rounded-[2rem] shadow-sm border border-slate-200/60 hover:shadow-xl hover:shadow-slate-200/50 hover:bg-white transition-all group hover:-translate-y-1"
            >
              <div className="flex flex-col sm:flex-row items-start gap-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-50 to-purple-50 border border-indigo-100 flex items-center justify-center flex-shrink-0 shadow-inner">
                  <FileText className="w-7 h-7 text-indigo-600" />
                </div>
                <div className="flex-1 w-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-100 px-3 py-1.5 rounded-full">
                        Relevance Score
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-indigo-500 rounded-full" 
                            style={{ width: `${Math.min(100, Math.round(result['@search.score'] * 100))}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-indigo-600">
                          {Math.round(result['@search.score'] * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-slate-700 mb-6 whitespace-pre-line text-base leading-relaxed bg-white/50 p-6 rounded-2xl border border-slate-100 shadow-inner italic font-medium">
                    "{result.content.trim()}"
                  </p>
                  
                  <Link
                    to={`/documents/${result.documentId}`}
                    className="inline-flex items-center px-6 py-3 bg-indigo-50 hover:bg-indigo-100 text-sm font-bold text-indigo-600 rounded-xl transition-colors group-hover:shadow-sm"
                  >
                    View Source Document <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default GlobalSearch;
