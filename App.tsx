import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TableData, HistoryEntry } from './types';
import VirtualKeyboard from './components/VirtualKeyboard';
import AuthModal from './components/AuthModal';
import AdminPage from './components/AdminPage';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const GRID_SIZE = 5;

const createEmptyPage = (): TableData => {
  return Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0));
};

type Theme = 'color' | 'day' | 'night';

const App: React.FC = () => {
  const [pages, setPages] = useState<TableData[]>([createEmptyPage()]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const [theme, setTheme] = useState<Theme>('color');
  const [isLocked, setIsLocked] = useState(false); 
  const [inputValue, setInputValue] = useState('');
  const [title, setTitle] = useState('Nouveau Comptage');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  
  // Description fields
  const [countNumber, setCountNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientMobile, setClientMobile] = useState('');
  const [transactionType, setTransactionType] = useState<'achat' | 'vente'>('vente');
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [companyName, setCompanyName] = useState('MA SOCIÉTÉ');
  const [decimalHandling, setDecimalHandling] = useState<'all' | 'none' | 'threshold'>('all');
  
  // Auth & Sync
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAdminPageOpen, setIsAdminPageOpen] = useState(false);
  const [showDemoPopup, setShowDemoPopup] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const isRemoteUpdate = useRef(false);

  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const savedAuth = localStorage.getItem('count_pro_auth');
    if (savedAuth) {
      const { token, user } = JSON.parse(savedAuth);
      setToken(token);
      setUser(user);
    }
  }, []);

  const syncState = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN && token && !isRemoteUpdate.current) {
      socketRef.current.send(JSON.stringify({
        type: 'update',
        state: {
          pages,
          title,
          history,
          countNumber,
          clientName,
          clientMobile,
          transactionType,
          unitPrice,
          decimalHandling
        }
      }));
    }
  }, [pages, title, history, countNumber, clientName, clientMobile, transactionType, unitPrice, decimalHandling, token]);

  useEffect(() => {
    if (token) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}`);
      socketRef.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'auth', token }));
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'error') {
          alert(data.message);
          if (data.message.includes('Limite')) {
            handleLogout();
          }
          return;
        }
        if (data.type === 'user_update') {
          setUser(data.user);
          const updatedAuth = JSON.parse(localStorage.getItem('count_pro_auth') || '{}');
          updatedAuth.user = data.user;
          localStorage.setItem('count_pro_auth', JSON.stringify(updatedAuth));
          return;
        }
        if (data.type === 'init' || data.type === 'update') {
          isRemoteUpdate.current = true;
          const { state } = data;
          setPages(state.pages);
          setTitle(state.title);
          setHistory(state.history);
          setCountNumber(state.countNumber);
          setClientName(state.clientName);
          setClientMobile(state.clientMobile);
          setTransactionType(state.transactionType);
          setUnitPrice(state.unitPrice);
          setDecimalHandling(state.decimalHandling);
          setTimeout(() => { isRemoteUpdate.current = false; }, 100);
        }
      };

      return () => socket.close();
    }
  }, [token]);

  useEffect(() => {
    if (token) syncState();
  }, [pages, title, history, countNumber, clientName, clientMobile, transactionType, unitPrice, decimalHandling, token, syncState]);

  useEffect(() => {
    const savedHistory = localStorage.getItem('count_pro_history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));
    
    const savedTheme = localStorage.getItem('count_pro_theme') as Theme;
    if (savedTheme) setTheme(savedTheme || 'color');
  }, []);

  useEffect(() => {
    localStorage.setItem('count_pro_theme', theme);
    const bgColors = {
      color: '#ffffff',
      day: '#ffffff',
      night: '#1a1a1a'
    };
    document.body.style.backgroundColor = bgColors[theme];
    document.body.style.color = theme === 'night' ? '#ffffff' : '#000000';
  }, [theme]);

  const [mvolaPhone, setMvolaPhone] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [showTooltip, setShowTooltip] = useState(false);
  const [currentSubPrice, setCurrentSubPrice] = useState<number>(200);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.subscriptionPrice) setCurrentSubPrice(data.subscriptionPrice);
      })
      .catch(err => console.error('Erreur prix:', err));
  }, []);

  const handleMVolaPayment = async () => {
    if (!mvolaPhone) {
      alert('Veuillez entrer votre numéro MVola');
      return;
    }

    // Check for admin number
    const normalizedPhone = mvolaPhone.replace(/\s/g, '');
    if (normalizedPhone === '0347685594') {
      alert('Le contact admin ne peut pas payer pour vous, entrer votre numéro MVola');
      return;
    }

    setPaymentLoading(true);
    setPaymentMessage('');
    try {
      const response = await fetch('/api/payment/mvola/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ phoneNumber: mvolaPhone })
      });
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Le serveur de paiement ne répond pas correctement. Veuillez réessayer.');
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPaymentMessage(data.message);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setPaymentLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role !== 'admin') {
      const subEnd = user.subscription_end || 0;
      const isSubscribed = subEnd > Date.now();
      
      if (!isSubscribed) {
        setShowDemoPopup(true);
      } else {
        setShowDemoPopup(false);
      }
    } else {
      setShowDemoPopup(false);
    }
  }, [user]);

  const handleAuthSuccess = (token: string, user: any) => {
    setToken(token);
    setUser(user);
    localStorage.setItem('count_pro_auth', JSON.stringify({ token, user }));
    if (user.company_name) setCompanyName(user.company_name);
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('count_pro_auth');
    socketRef.current?.close();
  };

  const cycleTheme = () => {
    setTheme(prev => {
      if (prev === 'color') return 'day';
      if (prev === 'day') return 'night';
      return 'color';
    });
  };

  const formatNum = (num: number) => {
    if (isNaN(num)) return 0;
    return Math.round(num * 1000) / 1000;
  };

  const formatDisplay = (num: number) => {
    if (num === 0) return "0";
    const val = Math.round(num * 1000) / 1000;
    const parts = val.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return parts.join(',');
  };

  const formatCurrency = (num: number) => {
    const rounded = Math.round(num);
    return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " Ar";
  };

  const getEffectiveValue = useCallback((val: number) => {
    if (decimalHandling === 'none') return Math.floor(val);
    if (decimalHandling === 'threshold') {
      const decimal = val - Math.floor(val);
      // Use a small epsilon for float comparison if needed, but 0.6 is simple
      return decimal > 0.6 ? val : Math.floor(val);
    }
    return val;
  }, [decimalHandling]);

  const globalTotal = formatNum(pages.reduce((acc, page) => {
    return acc + page.reduce((pAcc, row) => pAcc + row.reduce((rAcc, val) => rAcc + getEffectiveValue(val), 0), 0);
  }, 0));

  const saveToHistory = useCallback(() => {
    const total = globalTotal;
    
    if (total === 0 && pages.length === 1) return;

    const now = new Date();
    const newEntry: HistoryEntry = {
      id: Date.now().toString(),
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      title: title || 'Sans titre',
      pages: JSON.parse(JSON.stringify(pages)),
      total: total,
      countNumber,
      clientName,
      clientMobile,
      transactionType,
      unitPrice,
      companyName,
      decimalHandling
    };

    const newHistory = [newEntry, ...history].slice(0, 50);
    setHistory(newHistory);
    localStorage.setItem('count_pro_history', JSON.stringify(newHistory));
  }, [pages, title, history, globalTotal, countNumber, clientName, clientMobile, transactionType, unitPrice, companyName]);

  const loadFromHistory = (entry: HistoryEntry) => {
    setPages(JSON.parse(JSON.stringify(entry.pages)));
    setTitle(entry.title);
    setCountNumber(entry.countNumber || '');
    setClientName(entry.clientName || '');
    setClientMobile(entry.clientMobile || '');
    setTransactionType(entry.transactionType || 'vente');
    setUnitPrice(entry.unitPrice || 0);
    setCompanyName(entry.companyName || 'MA SOCIÉTÉ');
    setDecimalHandling(entry.decimalHandling || 'all');
    setCurrentIndex(0);
    setRow(0);
    setCol(0);
    setShowHistory(false);
    setIsLocked(false); 
  };

  const deleteFromHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newHistory = history.filter(h => h.id !== id);
    setHistory(newHistory);
    localStorage.setItem('count_pro_history', JSON.stringify(newHistory));
  };

  const renameHistoryEntry = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const entry = history.find(h => h.id === id);
    if (!entry) return;
    const newTitle = window.prompt("Nouveau titre :", entry.title);
    if (newTitle !== null && newTitle.trim() !== "") {
      const newHistory = history.map(h => h.id === id ? { ...h, title: newTitle.trim() } : h);
      setHistory(newHistory);
      localStorage.setItem('count_pro_history', JSON.stringify(newHistory));
    }
  };

  const getColTotals = (page: TableData) => {
    const totals = Array(GRID_SIZE).fill(0);
    for (let c = 0; c < GRID_SIZE; c++) {
      for (let r = 0; r < GRID_SIZE; r++) {
        totals[c] += getEffectiveValue(page[r][c] || 0);
      }
    }
    return totals.map(formatNum);
  };

  const addValue = useCallback(() => {
    if (isLocked) return;

    let raw = inputValue.replace(',', '.');
    if (raw === '.' || raw === '') return;
    
    const value = parseFloat(raw);
    if (isNaN(value)) return;

    setPages(prevPages => {
      const newPages = [...prevPages];
      const currentPage = [...newPages[currentIndex]];
      currentPage[row] = [...currentPage[row]];
      currentPage[row][col] = value;
      newPages[currentIndex] = currentPage;
      return newPages;
    });

    setInputValue('');

    let nextRow = row + 1;
    let nextCol = col;
    let nextIndex = currentIndex;

    if (nextRow === GRID_SIZE) {
      nextRow = 0;
      nextCol = col + 1;
    }

    if (nextCol === GRID_SIZE) {
      nextCol = 0;
      nextRow = 0;
      nextIndex = currentIndex + 1;
      if (pages.length <= nextIndex) {
        setPages(prev => [...prev, createEmptyPage()]);
      }
    }

    setRow(nextRow);
    setCol(nextCol);
    setCurrentIndex(nextIndex);
  }, [inputValue, row, col, currentIndex, pages.length, isLocked]);

  const resetAll = () => {
    if (globalTotal === 0 && pages.length === 1 && title === 'Nouveau Comptage') return;
    saveToHistory();
    setPages([createEmptyPage()]);
    setCurrentIndex(0);
    setRow(0);
    setCol(0);
    setInputValue('');
    setTitle('Nouveau Comptage');
    setCountNumber('');
    setClientName('');
    setClientMobile('');
    setUnitPrice(0);
    setIsLocked(false); 
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    const totalPrice = unitPrice * globalTotal;
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(companyName, 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Facture / Reçu: ${title} #${countNumber}`, 20, 40);
    
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 50);
    
    doc.line(20, 55, 190, 55);
    
    doc.text(`Client: ${clientName}`, 20, 70);
    doc.text(`Mobile: ${clientMobile}`, 20, 80);
    
    doc.line(20, 85, 190, 85);
    
    doc.text(`Type: ${transactionType.toUpperCase()}`, 20, 100);
    doc.text(`Quantité Totale: ${globalTotal}`, 20, 110);
    doc.text(`Prix Unitaire: ${unitPrice > 0 ? formatCurrency(unitPrice) : ''}`, 20, 120);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`PRIX TOTAL: ${totalPrice > 0 ? formatCurrency(totalPrice) : ''}`, 20, 140);
    
    // Add tables for each page
    let currentY = 150;
    let tableCol = 0; // 0 for left, 1 for right
    let maxYInRow = 0;
    
    pages.forEach((page, pIdx) => {
      // Check if page has data
      const hasData = page.some(row => row.some(val => val !== 0));
      if (!hasData && pIdx > 0) return;

      if (currentY > 240) {
        doc.addPage();
        currentY = 20;
        tableCol = 0;
        maxYInRow = 0;
      }

      const tableData = page.map(row => row.map(val => val === 0 ? '' : formatDisplay(getEffectiveValue(val))));
      const colTotals = getColTotals(page);
      tableData.push(colTotals.map(t => formatDisplay(t)));

      const marginX = tableCol === 0 ? 20 : 110;

      autoTable(doc, {
        startY: currentY,
        body: tableData,
        theme: 'grid',
        margin: { left: marginX },
        tableWidth: 80,
        styles: { fontSize: 10, cellPadding: 2 },
        didParseCell: (data) => {
          if (data.row.index === 5) { // Total row
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 240, 240];
          }
        }
      });

      const finalY = (doc as any).lastAutoTable.finalY;
      maxYInRow = Math.max(maxYInRow, finalY);

      if (tableCol === 1) {
        currentY = maxYInRow + 10;
        tableCol = 0;
        maxYInRow = 0;
      } else {
        tableCol = 1;
      }
    });
    
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Page ${i} sur ${pageCount}`, 105, 285, { align: 'center' });
      doc.text("Généré par Comptage Pro", 105, 290, { align: 'center' });
    }
    
    doc.save(`Facture_${title}_${countNumber}.pdf`);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchEndX - touchStartX.current;
    if (diff > 50 && currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else if (diff < -50 && currentIndex < pages.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
    touchStartX.current = null;
  };

  const getThemeClasses = () => {
    const isNight = theme === 'night';
    const isDay = theme === 'day';
    const isColor = theme === 'color';

    return {
      container: isNight ? 'text-white' : 'text-[#000000]',
      headerBg: isNight ? 'bg-[#2a2a2a] border-[#333]' : (isColor ? 'bg-white border-[#e0e0e0]' : 'bg-white border-[#666666]'),
      tableBg: isNight ? 'bg-[#2a2a2a] border-[#333]' : (isColor ? 'bg-[#f8f9fa] border-[#e0e0e0]' : 'bg-white border-[#666666]'),
      cellBg: isNight ? 'bg-[#333333] text-white' : 'bg-white text-[#000000]',
      cellBorder: isNight ? 'border-[#444]' : (isColor ? 'border-[#e0e0e0]' : 'border-[#666666]'),
      cellActive: isNight ? 'ring-white/30' : 'ring-[#000000]/20',
      footerBg: isNight ? 'bg-white text-[#1a1a1a] border-white' : (isColor ? 'bg-[#1976d2] text-white border-[#1976d2]' : 'bg-[#000000] text-white border-[#000000]'),
      btnTheme: isNight ? 'bg-[#333] text-white border-[#444]' : (isColor ? 'bg-[#f2f2f2] text-[#1976d2] border-[#e0e0e0]' : 'bg-white text-[#000000] border-[#666666]'),
      inputTitle: isNight ? 'text-white' : (isColor ? 'text-[#1976d2]' : 'text-[#000000]'),
      totalLabel: isNight ? 'text-[#000000]/60' : 'text-white/60',
      dots: isNight ? 'bg-white' : (isColor ? 'bg-[#1976d2]' : 'bg-[#000000]'),
      inputBox: isNight ? 'bg-[#333] text-white border-[#444]' : (isColor ? 'bg-white text-[#1976d2] border-white' : 'bg-white text-[#000000] border-white'),
      inputBoxLabel: isNight ? 'text-white/50' : (isColor ? 'text-[#1976d2]/60' : 'text-[#000000]/60'),
      signature: isNight ? 'text-[#000000]/40' : 'text-white/40',
      sidebar: isNight ? 'bg-[#1a1a1a] border-[#333] text-white' : 'bg-white border-[#e0e0e0] text-[#000000]',
      sidebarInput: isNight ? 'bg-[#2a2a2a] border-[#444] text-white' : 'bg-gray-50 border-gray-200 text-[#000000]'
    };
  };

  const classes = getThemeClasses();

  return (
    <div className={`fixed inset-0 h-full w-full flex flex-col overflow-hidden select-none p-2 transition-colors duration-300 ${classes.container}`}>
      
      {/* SIDEBAR TRIGGER */}
      <button 
        onClick={() => setIsDescriptionOpen(true)}
        className={`fixed left-0 top-1/2 -translate-y-1/2 z-40 w-6 h-20 rounded-r-lg flex items-center justify-center shadow-lg border-y border-r transition-all active:scale-95 ${classes.sidebar}`}
      >
        <i className="fa-solid fa-chevron-right text-[10px] opacity-50"></i>
      </button>

      {/* DESCRIPTION SIDEBAR */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 shadow-2xl border-r transition-transform duration-300 ease-in-out transform ${isDescriptionOpen ? 'translate-x-0' : '-translate-x-full'} ${classes.sidebar}`}>
        <div className="flex flex-col h-full p-5 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black uppercase tracking-tighter">Description</h2>
            <button onClick={() => setIsDescriptionOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-black text-xl font-bold active:scale-90 transition-transform">×</button>
          </div>

          <div className="space-y-4 flex-1">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase opacity-50 ml-1">Nom du Comptage</label>
              <input 
                type="text" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)}
                className={`w-full p-3 rounded-xl border outline-none text-sm font-bold ${classes.sidebarInput}`}
                placeholder="Titre"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase opacity-50 ml-1">Numéro du Comptage</label>
              <input 
                type="text" 
                value={countNumber} 
                onChange={(e) => setCountNumber(e.target.value)}
                className={`w-full p-3 rounded-xl border outline-none text-sm font-bold ${classes.sidebarInput}`}
                placeholder="#001"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase opacity-50 ml-1">Nom du Client</label>
              <input 
                type="text" 
                value={clientName} 
                onChange={(e) => setClientName(e.target.value)}
                className={`w-full p-3 rounded-xl border outline-none text-sm font-bold ${classes.sidebarInput}`}
                placeholder="Client"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase opacity-50 ml-1">Numéro Mobile</label>
              <input 
                type="tel" 
                value={clientMobile} 
                onChange={(e) => setClientMobile(e.target.value)}
                className={`w-full p-3 rounded-xl border outline-none text-sm font-bold ${classes.sidebarInput}`}
                placeholder="00 00 00 00 00"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase opacity-50 ml-1">Type de Transaction</label>
              <div className="flex gap-2">
                <button 
                  onClick={() => setTransactionType('achat')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${transactionType === 'achat' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-transparent opacity-40'}`}
                >ACHAT</button>
                <button 
                  onClick={() => setTransactionType('vente')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${transactionType === 'vente' ? 'bg-blue-500 text-white border-blue-500' : 'bg-transparent opacity-40'}`}
                >VENTE</button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase opacity-50 ml-1">Prix Unitaire</label>
              <input 
                type="number" 
                value={unitPrice || ''} 
                onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                className={`w-full p-3 rounded-xl border outline-none text-sm font-bold ${classes.sidebarInput}`}
                placeholder="0"
              />
              {unitPrice > 0 && (
                <div className="text-[10px] font-bold text-blue-500 ml-1">
                  {formatCurrency(unitPrice)}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase opacity-50 ml-1">Gestion des Virgules</label>
              <div className="grid grid-cols-1 gap-1">
                <button 
                  onClick={() => setDecimalHandling('all')}
                  className={`w-full py-2 rounded-lg text-[10px] font-bold border transition-all ${decimalHandling === 'all' ? 'bg-blue-500 text-white border-blue-500' : 'bg-transparent opacity-40'}`}
                >COMPTER LES VIRGULES</button>
                <button 
                  onClick={() => setDecimalHandling('none')}
                  className={`w-full py-2 rounded-lg text-[10px] font-bold border transition-all ${decimalHandling === 'none' ? 'bg-blue-500 text-white border-blue-500' : 'bg-transparent opacity-40'}`}
                >NE PAS COMPTER</button>
                <button 
                  onClick={() => setDecimalHandling('threshold')}
                  className={`w-full py-2 rounded-lg text-[10px] font-bold border transition-all ${decimalHandling === 'threshold' ? 'bg-blue-500 text-white border-blue-500' : 'bg-transparent opacity-40'}`}
                >COMPTER SI &gt; 0,6</button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase opacity-50 ml-1">Ma Société</label>
              <input 
                type="text" 
                value={companyName} 
                onChange={(e) => setCompanyName(e.target.value)}
                className={`w-full p-3 rounded-xl border outline-none text-sm font-bold ${classes.sidebarInput}`}
                placeholder="Nom Société"
              />
            </div>

            <div className="pt-4 border-t border-dashed mt-4">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs opacity-50">Total Quantité</span>
                <span className="font-bold">{globalTotal}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold">PRIX TOTAL</span>
                <span className="text-lg font-black text-blue-500">{formatCurrency(unitPrice * globalTotal)}</span>
              </div>
            </div>
          </div>

          <button 
            onClick={downloadPDF}
            className="w-full py-4 rounded-2xl bg-blue-600 text-white font-black uppercase tracking-widest active:scale-95 transition-all mt-6 shadow-lg flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-file-pdf"></i>
            Facture PDF
          </button>

          {user?.role === 'admin' && (
            <button 
              onClick={() => setIsAdminPageOpen(true)}
              className="w-full py-3 rounded-xl bg-purple-600 text-white font-black uppercase tracking-widest active:scale-95 transition-all mt-4 shadow-lg flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-user-shield"></i>
              Admin Panel
            </button>
          )}

          {user && (
            <button 
              onClick={handleLogout}
              className="w-full py-3 rounded-xl border border-red-500/20 text-red-500 font-bold text-[10px] uppercase tracking-widest active:scale-95 transition-all mt-4 flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-right-from-bracket"></i>
              Déconnexion
            </button>
          )}
        </div>
      </div>

      {/* OVERLAY FOR SIDEBAR */}
      {isDescriptionOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40 transition-opacity"
          onClick={() => setIsDescriptionOpen(false)}
        />
      )}

      {/* AUTH MODAL */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onSuccess={handleAuthSuccess}
        theme={theme}
      />

      {/* ADMIN PAGE */}
      {isAdminPageOpen && token && (
        <AdminPage 
          token={token} 
          onClose={() => setIsAdminPageOpen(false)} 
          theme={theme} 
        />
      )}

      {/* DEMO POPUP */}
      {showDemoPopup && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className={`w-full max-w-sm p-8 rounded-3xl shadow-2xl border-2 border-blue-500 text-center ${theme === 'night' ? 'bg-[#1a1a1a] text-white' : 'bg-white text-black'}`}>
            <div className="w-16 h-16 bg-blue-500/20 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fa-solid fa-circle-info text-3xl"></i>
            </div>
            <p className="text-sm font-bold opacity-70 mb-8 leading-relaxed">
              Bonjour,<br />
              si l'app vous aide, vous devez payer <span className="text-blue-500">{currentSubPrice.toLocaleString()} Ar</span> pour un (1) mois.
            </p>
            
            <div className="relative">
              <AnimatePresence>
                {showTooltip && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute bottom-full left-0 right-0 mb-4 p-4 bg-[#3c3c3b]/60 backdrop-blur-md text-white text-[11px] font-bold rounded-2xl shadow-xl z-50 leading-relaxed text-center border border-white/10"
                  >
                    <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-[#3c3c3b]/60 backdrop-blur-md rotate-45 border-r border-b border-white/10" />
                    Pour payer, vous devez mettre votre numéro MVola de paiement, cliquer sur PAYER, et attendre quelques instants. Vous recevrez une demande de validation sur votre mobile.
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="p-2 bg-[#ffdd00] rounded-2xl border border-[#ffdd00] mb-6 flex items-center gap-3 shadow-sm relative z-10">
                <div className="w-16 h-10 flex items-center justify-center shrink-0 overflow-hidden ml-1">
                  <img 
                    src="https://www.mvola.mg/wp-content/uploads/2022/03/Logo-MVola-1.png" 
                    alt="MVola" 
                    className="h-full w-full object-contain scale-150"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        parent.innerHTML = '<span class="text-[#006935] font-black italic text-sm">MVola</span>';
                      }
                    }}
                  />
                </div>
                
                <input 
                  type="tel"
                  placeholder="034 00 000 00"
                  value={mvolaPhone}
                  onChange={(e) => setMvolaPhone(e.target.value)}
                  onFocus={() => setShowTooltip(true)}
                  onBlur={() => setShowTooltip(false)}
                  className="w-32 p-1 bg-transparent border-none outline-none font-black text-sm text-[#000] placeholder:text-[#000]/30"
                />
                
                <button 
                  onClick={handleMVolaPayment}
                  disabled={paymentLoading}
                  className={`ml-auto h-9 px-4 rounded-xl bg-[#006935] text-white font-black text-[10px] uppercase tracking-wider flex items-center justify-center transition-all shadow-md ${paymentLoading ? 'opacity-50' : 'active:scale-95 hover:bg-[#005a2d]'}`}
                >
                  {paymentLoading ? (
                    <i className="fa-solid fa-circle-notch animate-spin"></i>
                  ) : (
                    "Payer"
                  )}
                </button>
              </div>
            </div>

            <div className="mb-4">
              {paymentMessage && (
                <div className="p-4 bg-[#006935]/10 text-[#006935] rounded-2xl text-xs font-bold leading-relaxed mb-2">
                  {paymentMessage}
                </div>
              )}
            </div>

            <div className="mt-8 pt-4 border-t border-gray-100/10 text-center">
              <p className="text-[9px] font-bold text-[#3c3c3b] opacity-40 uppercase tracking-widest">
                Admin: 034 76 855 94
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[500px] mx-auto w-full flex flex-col h-full gap-2 relative">
        
        {/* HEADER */}
        <header className="flex flex-col gap-1 shrink-0">
          <div className="flex gap-2 h-[7vh] min-h-[44px] max-h-[52px]">
            <div className={`flex-1 flex items-center px-4 rounded-xl border transition-colors duration-300 ${classes.headerBg} gap-3`}>
              <button 
                onClick={() => setIsAuthModalOpen(true)}
                className={`w-3 h-3 rounded-full shrink-0 transition-all shadow-[0_0_8px_rgba(34,197,94,0.4)] ${user ? 'bg-green-500' : 'bg-gray-300 animate-pulse'}`}
                title={user ? `Connecté en tant que ${user.email}` : 'Se connecter'}
              />
              <input 
                type="text" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)}
                className={`w-full bg-transparent border-none outline-none text-sm font-bold uppercase tracking-tight truncate ${classes.inputTitle}`}
                placeholder="TITRE"
              />
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button onClick={resetAll} className={`w-11 h-full rounded-xl flex items-center justify-center font-bold text-lg active:scale-95 transition-all shadow-sm border ${theme === 'color' ? 'bg-[#1976d2] text-white border-transparent' : 'bg-[#000000] text-white border-transparent'}`}>×</button>
              
              <button 
                onClick={cycleTheme} 
                className={`w-11 h-full rounded-xl flex items-center justify-center text-sm active:scale-95 transition-all shadow-sm border ${classes.btnTheme}`}
              >
                <i className={`fa-solid ${theme === 'color' ? 'fa-palette text-[#1976d2]' : theme === 'day' ? 'fa-sun text-[#000000]' : 'fa-moon text-white'} text-base`}></i>
              </button>

              <button 
                onClick={() => setIsLocked(!isLocked)} 
                className={`w-11 h-full rounded-xl flex items-center justify-center text-sm active:scale-95 transition-all shadow-sm border ${!isLocked 
                  ? (theme === 'night' ? 'bg-white text-[#1a1a1a] border-transparent' : (theme === 'day' ? 'bg-black text-white border-transparent' : 'bg-blue-50 text-[#1976d2] border-[#1976d2]')) 
                  : (theme === 'night' ? 'bg-transparent text-white/20 border-white/20' : 'bg-transparent text-[#000000]/20 border-[#666666]')
                }`}
              >
                <i className={`fa-solid ${isLocked ? 'fa-lock' : 'fa-unlock'}`}></i>
              </button>
            </div>
          </div>
        </header>

        {/* TABLEAU */}
        <main className="flex-1 min-h-0 w-full relative overflow-hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <div className="flex slider-transition h-full w-full" style={{ transform: `translateX(-${currentIndex * 100}%)` }}>
            {pages.map((page, pIdx) => (
              <div key={pIdx} className="min-w-full h-full flex flex-col p-0.5">
                <div className={`flex-1 grid grid-cols-5 grid-rows-6 gap-1 p-1 rounded-xl shadow-sm border transition-all duration-300 ${classes.tableBg} ${isLocked ? 'opacity-80' : 'opacity-100'}`}>
                  {page.map((rowArr, rIdx) => rowArr.map((cell, cIdx) => {
                    const isDecimalCounted = (val: number) => {
                      if (decimalHandling === 'all') return true;
                      if (decimalHandling === 'none') return false;
                      if (decimalHandling === 'threshold') return (val - Math.floor(val)) > 0.6;
                      return true;
                    };

                    const renderCellValue = (val: number) => {
                      if (val === 0) return '';
                      const v = Math.round(val * 1000) / 1000;
                      const parts = v.toString().split('.');
                      const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
                      const decimalPart = parts[1];
                      
                      if (!decimalPart) return integerPart;
                      
                      return (
                        <>
                          {integerPart}
                          <span className={isDecimalCounted(val) ? '' : 'opacity-30'}>,{decimalPart}</span>
                        </>
                      );
                    };

                    return (
                      <div 
                        key={`${rIdx}-${cIdx}`}
                        onClick={() => { if (!isLocked) { setRow(rIdx); setCol(cIdx); } }}
                        className={`flex items-center justify-center rounded-lg text-lg font-bold transition-all duration-200 h-full w-full border ${classes.cellBg} ${classes.cellBorder} ${!isLocked && pIdx === currentIndex && rIdx === row && cIdx === col ? `ring-2 ${classes.cellActive} ring-inset z-10 scale-105` : ''} ${isLocked ? 'cursor-default' : 'cursor-pointer active:scale-95'}`}
                      >
                        {renderCellValue(cell)}
                      </div>
                    );
                  }))}
                  {getColTotals(page).map((total, tIdx) => (
                    <div key={`total-${tIdx}`} className={`flex items-center justify-center rounded-lg text-xs font-black transition-all duration-300 h-full w-full ${theme === 'night' ? 'bg-[#333] text-white' : (theme === 'color' ? 'bg-blue-50 text-[#1976d2]' : 'bg-[#f2f2f2] text-[#000000]')}`}>
                      {formatDisplay(total)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </main>

        {/* FOOTER TOTALS */}
        <footer className="shrink-0 flex flex-col gap-1.5">
          <div className="flex justify-center items-center gap-1.5">
            {pages.map((_, idx) => (
              <div key={idx} className={`h-1 rounded-full transition-all duration-300 ${idx === currentIndex ? `${classes.dots} w-4` : 'bg-gray-400/20 w-1'}`} />
            ))}
          </div>
          <div className={`flex items-stretch overflow-hidden rounded-xl shadow-sm border transition-all duration-300 ${classes.footerBg}`}>
            {/* BLOC SAISIE */}
            <div className={`flex-[1.4] flex flex-col justify-center items-center m-1 rounded-lg border shadow-inner transition-all duration-300 ${classes.inputBox}`}>
              <span className={`text-[8px] font-bold uppercase tracking-widest mb-0.5 ${classes.inputBoxLabel}`}>Saisie</span>
              <div className="text-3xl font-black leading-none drop-shadow-sm">{inputValue || <span className="opacity-20 text-2xl">0</span>}</div>
            </div>
            {/* BLOC TOTAL AVEC SIGNATURE DISCRÈTE */}
            <div className="flex-[2] flex flex-col justify-center items-end px-4 py-2 relative">
              <span className={`text-[8px] font-bold uppercase tracking-widest mb-0.5 ${classes.totalLabel}`}>Total Général</span>
              <div className="text-2xl font-black leading-none">{formatDisplay(globalTotal)}</div>
              {/* SIGNATURE DISCRÈTE - STYLE APPLE SUR DEUX LIGNES */}
              <div className={`absolute bottom-0.5 left-3 flex flex-col items-start pointer-events-none transition-opacity duration-300 leading-tight ${classes.signature}`}>
                <span className="text-2xl font-black tracking-tighter">Mco</span>
                <span className="text-[7px] font-extralight tracking-[0.2em] opacity-80 -mt-0.5 uppercase">/ 032 90 709 19</span>
              </div>
            </div>
          </div>
        </footer>

        {/* CLAVIER */}
        <section className="shrink-0">
          <VirtualKeyboard 
            theme={theme}
            isLocked={isLocked}
            onKeyPress={(key) => { if (key === '.' && inputValue.includes('.')) return; setInputValue(prev => prev + key); }}
            onClear={() => setInputValue(prev => prev.slice(0, -1))}
            onValidate={addValue}
            onShowHistory={() => setShowHistory(true)}
          />
        </section>

        {/* HISTORIQUE OVERLAY */}
        {showHistory && (
          <div className={`absolute inset-0 z-50 flex flex-col p-4 animate-in fade-in slide-in-from-bottom-4 duration-300 ${theme === 'night' ? 'bg-[#1a1a1a] text-white' : 'bg-white text-[#000000]'}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-black uppercase tracking-tighter">Historique</h2>
              <button onClick={() => setShowHistory(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-black text-xl font-bold active:scale-90 transition-transform">×</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pb-4 px-1">
              {history.length === 0 ? (
                <div className="text-center opacity-30 py-20 text-xs uppercase tracking-widest">Vide</div>
              ) : (
                history.map((item) => (
                  <div key={item.id} onClick={() => loadFromHistory(item)} className={`p-3 rounded-xl border transition-all active:scale-[0.98] cursor-pointer relative shadow-sm ${theme === 'night' ? 'bg-[#2a2a2a] border-[#333]' : 'bg-[#f9f9f9] border-[#e0e0e0]'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[9px] font-bold opacity-40 uppercase tracking-widest">{item.date} • {item.time}</span>
                      <div className="flex gap-4">
                        <button onClick={(e) => renameHistoryEntry(item.id, e)} className="text-black/30 p-1 active:scale-125 transition-transform"><i className="fa-solid fa-pen text-[10px]"></i></button>
                        <button onClick={(e) => deleteFromHistory(item.id, e)} className="text-red-500/30 p-1 active:scale-125 transition-transform"><i className="fa-solid fa-trash-can text-[10px]"></i></button>
                      </div>
                    </div>
                    <div className="font-bold text-sm truncate pr-16">{item.title}</div>
                    <div className="flex items-center justify-between mt-1">
                      <div className={`font-black text-lg ${theme === 'night' ? 'text-white' : 'text-[#000000]'}`}>{formatDisplay(item.total)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <button onClick={() => setShowHistory(false)} className={`w-full py-3 rounded-xl font-bold uppercase tracking-widest active:scale-95 transition-all mt-4 border ${theme === 'night' ? 'bg-white text-[#1a1a1a]' : 'bg-[#000000] text-white'}`}>Fermer</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;