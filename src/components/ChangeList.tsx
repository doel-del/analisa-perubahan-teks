import React, { useState, useEffect } from 'react';
import {
  ListFilter,
  Search,
  PlusCircle,
  MinusCircle,
  ArrowLeftRight,
  Eye,
  CheckCircle2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Save
} from 'lucide-react';
import { TextChangeItem, ChangeType } from '../types';

interface ChangeListProps {
  changeItems: TextChangeItem[];
  selectedItem?: TextChangeItem;
  onSelectItem: (item: TextChangeItem | undefined) => void;
}

// Daftar pilihan kamus yang tersedia (Sesuaikan dengan ID template Anda di promptTemplates.json)
const DICTIONARY_OPTIONS = [
  { id: 'stt_lucid', name: '📝 Kamus Lucid LD60 (stt_lucid.json)' },
  { id: 'mesinbor', name: '🔧 Kamus Mesin Bor (mesinbor.json)' },
  { id: 'otomotif', name: '⚡ Kamus Otomotif (otomotif.json)' },
];

export const ChangeList: React.FC<ChangeListProps> = ({
  changeItems,
  selectedItem,
  onSelectItem
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // State untuk fitur "Tambah ke Kamus"
  const [selectedDict, setSelectedDict] = useState<string>(DICTIONARY_OPTIONS[0].id);
  const [isAdding, setIsAdding] = useState(false);
  const [notifMessage, setNotifMessage] = useState<string | null>(null);

  const filteredItems = changeItems.filter((item) => {
    if (filterType !== 'all' && item.type !== filterType) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchOld = item.oldText?.toLowerCase().includes(q) || false;
      const matchNew = item.newText?.toLowerCase().includes(q) || false;
      return matchDesc || matchOld || matchNew;
    }
    return true;
  });

  // Reset ke halaman 1 jika filter berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, searchQuery]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentItems = filteredItems.slice(startIndex, startIndex + itemsPerPage);

  const addedCount = changeItems.filter((i) => i.type === 'added').length;
  const removedCount = changeItems.filter((i) => i.type === 'removed').length;
  const modifiedCount = changeItems.filter((i) => i.type === 'modified').length;

  // =======================================================
  // 🔥 FUNGSI UNTUK MENAMBAHKAN KE DATABASE KAMUS
  // =======================================================
  const handleAddToDictionary = async (item: TextChangeItem) => {
    // Validasi: Hanya bisa menambahkan jika tipe 'modified' dan memiliki nilai lama dan baru
    if (item.type !== 'modified' || !item.oldText || !item.newText) {
      alert('Hanya perubahan tipe "Diganti (↔)" yang bisa ditambahkan ke kamus.');
      return;
    }

    setIsAdding(true);
    setNotifMessage(null);

    try {
      const response = await fetch('/api/dictionary/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dictionaryName: selectedDict, // Nama file kamus (misal: mesinbor, stt_lucid)
          original: item.oldText,
          corrected: item.newText
        }),
      });

      const data = await response.json();
      setNotifMessage(data.message);

      // 🔥 PERBAIKAN 1: Hapus baris onSelectItem(undefined)!
      // Jika sukses, cukup hilangkan notifikasi setelah 3 detik.
      // Jangan panggil onSelectItem agar aplikasi tidak me-refresh/default.
      if (data.success) {
        setTimeout(() => {
          setNotifMessage(null);
        }, 3000);
      }
    } catch (err) {
      console.error(err);
      setNotifMessage('Gagal terhubung ke server.');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="bg-white border border-slate-300 rounded-xl shadow-xs overflow-hidden">
      {/* Header & Title */}
      <div className="px-4 sm:px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ListFilter className="w-5 h-5 text-blue-600" />
            Keterangan Perubahan Teks ({changeItems.length} poin)
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            💡 <strong>Klik pada salah satu keterangan di bawah</strong> untuk melihat
            teks yang diwarnai pada kolom di atas
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kata yang diubah..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Filter Toolbar + Pagination Controls */}
      <div className="px-4 sm:px-6 py-2.5 bg-slate-100/60 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        {/* Kiri: Tombol Filter */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
              filterType === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            <span>Semua</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${filterType === 'all' ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {changeItems.length}
            </span>
          </button>

          <button onClick={() => setFilterType('added')} className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${filterType === 'added' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Ditambahkan (+)</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${filterType === 'added' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-700'}`}>{addedCount}</span>
          </button>

          <button onClick={() => setFilterType('removed')} className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${filterType === 'removed' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
            <MinusCircle className="w-3.5 h-3.5" />
            <span>Dihapus (-)</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${filterType === 'removed' ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-700'}`}>{removedCount}</span>
          </button>

          <button onClick={() => setFilterType('modified')} className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${filterType === 'modified' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Diganti (↔)</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${filterType === 'modified' ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-700'}`}>{modifiedCount}</span>
          </button>
        </div>

        {/* Kanan: Kontrol Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <button onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1} className="p-1 rounded hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:hover:bg-transparent">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-1.5">Halaman {currentPage} dari {totalPages}</span>
            <button onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="p-1 rounded hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:hover:bg-transparent">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* List Body */}
      <div className="p-4 sm:p-6">
        {/* 🔥 Notifikasi Global dari server */}
        {notifMessage && (
          <div className={`mb-3 p-3 rounded-lg text-xs font-medium shadow-xs border flex items-center gap-2 ${notifMessage.includes('berhasil') || notifMessage.includes('✅') ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            {notifMessage.includes('✅') ? '✅' : '⚠️'} {notifMessage}
          </div>
        )}

        {filteredItems.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
            <CheckCircle2 className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-700">Tidak ada perubahan teks yang ditemukan</h4>
            <p className="text-xs text-slate-500 mt-1">
              {changeItems.length === 0 ? 'Kedua teks identik atau belum ada input.' : 'Coba ubah kata kunci pencarian atau filter tipe di atas.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {currentItems.map((item) => {
              const isSelected = selectedItem?.id === item.id;

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(isSelected ? undefined : item)}
                  className={`group relative p-3 sm:p-4 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-amber-400 bg-amber-50/90 ring-2 ring-amber-300 shadow-md'
                      : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 bg-white shadow-2xs'
                  }`}
                >
                  {/* Bagian Kiri: Content, Badge, dll */}
                  <div className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 mt-0.5 ${isSelected ? 'bg-amber-500 text-white shadow-xs' : item.type === 'added' ? 'bg-emerald-100 text-emerald-800' : item.type === 'removed' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'}`}>
                      #{item.index}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${item.type === 'added' ? 'bg-emerald-100 text-emerald-800' : item.type === 'removed' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'}`}>
                          {item.type === 'added' ? '+ Ditambahkan' : item.type === 'removed' ? '- Dihapus' : '↔ Diganti'}
                        </span>
                        <span className="text-xs text-slate-400">{item.wordCount} kata • {item.charCount} karakter</span>
                        {isSelected && (
                          <span className="text-xs font-bold text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded-full flex items-center gap-1 animate-fadeIn">
                            <Eye className="w-3 h-3" /> Teks Diwarna Disorot!
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-800 leading-snug">{item.description}</p>
                      {item.type === 'modified' && item.oldText && item.newText && (
                        <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-900">
                            <span className="font-bold block text-[10px] text-rose-600 uppercase">Sebelum (Dihapus):</span>
                            <span className="line-through">{item.oldText}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
                            <span className="font-bold block text-[10px] text-emerald-600 uppercase">Sesudah (Ditambahkan):</span>
                            <span>{item.newText}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 🔥 Bagian Kanan: Aksi "Tambah ke Kamus" & CTA Badge */}
                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                    
                    {/* Muncul hanya jika item dipilih DAN tipe Modified */}
                    {isSelected && item.type === 'modified' && item.oldText && item.newText && (
                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 bg-white/80 backdrop-blur-xs p-1.5 rounded-lg border border-amber-200 shadow-2xs animate-in fade-in zoom-in-95">
                        {/* Dropdown Pilihan Kamus */}
                        <select
                          value={selectedDict}
                          onChange={(e) => setSelectedDict(e.target.value)}
                          className="text-[10px] bg-slate-50 border border-slate-300 rounded px-2 py-1 font-medium text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                          onClick={(e) => e.stopPropagation()} // Mencegah trigger onSelectItem saat klik dropdown
                        >
                          {DICTIONARY_OPTIONS.map(opt => (
                            <option key={opt.id} value={opt.id}>{opt.name}</option>
                          ))}
                        </select>

                        {/* 🔥 PERBAIKAN 2: Tambahkan type="button" untuk mencegah submit form (refresh) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation(); // Mencegah trigger onSelectItem saat klik tombol
                            handleAddToDictionary(item);
                          }}
                          disabled={isAdding}
                          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
                        >
                          {isAdding ? (
                            <span className="flex items-center gap-1"><span className="animate-spin">⟳</span> Menyimpan...</span>
                          ) : (
                            <span className="flex items-center gap-1"><Save className="w-3 h-3" /> Tambah ke Kamus</span>
                          )}
                        </button>
                      </div>
                    )}

                    {/* CTA Badge standar */}
                    <span className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1 shrink-0 ${isSelected ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-100 text-slate-600 group-hover:bg-blue-600 group-hover:text-white'}`}>
                      <Eye className="w-3.5 h-3.5" />
                      <span>{isSelected ? 'Sorotan Aktif' : 'Lihat di Teks'}</span>
                    </span>
                  </div>

                </div>
              );
            })}
          </div>
        )}
        
        {/* Bottom Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6 pt-2 border-t border-slate-100">
            <button onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1} className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40">Sebelumnya</button>
            <span className="text-xs font-medium text-slate-600">Halaman {currentPage} dari {totalPages}</span>
            <button onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40">Selanjutnya</button>
          </div>
        )}
      </div>
    </div>
  );
};