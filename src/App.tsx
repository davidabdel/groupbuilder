import React, { useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { 
  Users, 
  Upload, 
  FileText, 
  Settings2, 
  LayoutDashboard, 
  ChevronRight, 
  CheckCircle2, 
  ShieldCheck, 
  UserPlus, 
  Trash2,
  RefreshCw,
  Download,
  AlertCircle,
  Mail,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Search,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Publisher, Standing, PublisherType, GroupResult } from './types';
import { generateGroups } from './services/groupLogic';
import { cn } from './lib/utils';

// --- Components ---

const StepIndicator = ({ currentStep }: { currentStep: number }) => {
  const steps = [
    { id: 1, name: 'Upload', icon: Upload },
    { id: 2, name: 'Review', icon: Users },
    { id: 3, name: 'Settings', icon: Settings2 },
    { id: 4, name: 'Groups', icon: LayoutDashboard },
  ];

  return (
    <div className="flex items-center justify-center space-x-2 mb-8 bg-white border border-border p-2 rounded-[3px] shadow-sm max-w-fit mx-auto">
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          <div className={cn(
            "flex items-center space-x-2 px-3 py-1.5 rounded-[2px] transition-all duration-200",
            currentStep === step.id ? "bg-accent-light text-accent" : "text-text-sub"
          )}>
            <div className={cn(
              "w-6 h-6 flex items-center justify-center transition-all duration-300",
              currentStep === step.id ? "text-accent" : currentStep > step.id ? "text-success" : "text-text-sub"
            )}>
              {currentStep > step.id ? <CheckCircle2 size={16} /> : <step.icon size={16} />}
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider">{step.name}</span>
          </div>
          {index < steps.length - 1 && (
            <div className="text-border">/</div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default function App() {
  const [step, setStep] = useState(1);
  const [publishers, setPublishers] = useState<Publisher[]>(() => {
    const saved = localStorage.getItem('bmg_publishers');
    return saved ? JSON.parse(saved) : [];
  });
  const [result, setResult] = useState<GroupResult | null>(() => {
    const saved = localStorage.getItem('bmg_result');
    return saved ? JSON.parse(saved) : null;
  });
  const [groupsCount, setGroupsCount] = useState(() => {
    const saved = localStorage.getItem('bmg_groupsCount');
    return saved ? Number(saved) : 10;
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof Publisher>('lastName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Persistence
  useEffect(() => {
    localStorage.setItem('bmg_publishers', JSON.stringify(publishers));
  }, [publishers]);

  useEffect(() => {
    localStorage.setItem('bmg_result', JSON.stringify(result));
  }, [result]);

  useEffect(() => {
    localStorage.setItem('bmg_groupsCount', groupsCount.toString());
  }, [groupsCount]);

  // Determine initial step based on data
  useEffect(() => {
    if (publishers.length > 0 && step === 1) {
      setStep(2);
    }
  }, []);

  const clearData = () => {
    if (confirm("Are you sure you want to clear all data? This will reset the app.")) {
      setPublishers([]);
      setResult(null);
      setStep(1);
      localStorage.removeItem('bmg_publishers');
      localStorage.removeItem('bmg_result');
      localStorage.removeItem('bmg_groupsCount');
    }
  };

  // ... (rest of the logic remains the same)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'csv') {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const rawData = results.data as string[][];
          
          // Find the actual header row (the one containing "First Name" or similar)
          const headerRowIndex = rawData.findIndex(row => 
            row.some(cell => {
              const c = String(cell).toLowerCase();
              return c.includes('first name') || c.includes('firstname') || c.includes('first_name');
            })
          );

          if (headerRowIndex === -1) {
            // If we can't find a header row, try parsing with headers automatically as fallback
            Papa.parse(file, {
              header: true,
              skipEmptyLines: true,
              complete: (results) => processImportedData(results.data),
            });
            return;
          }

          const headers = rawData[headerRowIndex].map(h => h.trim());
          const dataRows = rawData.slice(headerRowIndex + 1);
          
          const mappedData = dataRows.map(row => {
            const obj: any = {};
            headers.forEach((header, i) => {
              if (header) obj[header] = row[i];
            });
            return obj;
          });
          
          processImportedData(mappedData);
        },
      });
    } else if (['xlsx', 'xls'].includes(extension || '')) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        // For Excel, we'll use sheet_to_json but also pass it through processImportedData
        // which we will make more resilient.
        const data = XLSX.utils.sheet_to_json(ws);
        processImportedData(data);
      };
      reader.readAsBinaryString(file);
    }
  };

  const processImportedData = (data: any[]) => {
    if (!data || data.length === 0) {
      alert("No data found in the file.");
      return;
    }

    const standardized: Publisher[] = data
      .filter(row => {
        // Robust check for a valid row - must have some kind of name
        const hasName = (val: any) => val && String(val).trim().length > 0;
        
        return hasName(row['First Name']) || 
               hasName(row.firstName) || 
               hasName(row.first_name) ||
               Object.values(row).some(v => hasName(v) && !String(v).toLowerCase().includes('first name'));
      })
      .map((row, index) => {
        // Find values by variations of likely header names
        const findVal = (keys: string[]) => {
          const key = Object.keys(row).find(k => 
            keys.some(v => k.toLowerCase().replace(/[\s_]/g, '') === v.toLowerCase().replace(/[\s_]/g, ''))
          );
          return key ? row[key] : '';
        };

        const firstName = findVal(['FirstName', 'First Name']) || '';
        const lastName = findVal(['LastName', 'Last Name']) || '';
        
        // Map standing (E, MS, P, etc.)
        let standing = String(findVal(['Standing', 'Group Standing']) || '').trim().toUpperCase();
        
        // Map publisher type (P, RP, etc.)
        // Note: CSV has "Publisher" column for Type
        let publisherType = String(findVal(['Publisher Type', 'PublisherType', 'Publisher']) || '').trim().toUpperCase();

        const familyId = findVal(['Family ID', 'FamilyID', 'Household Name', 'Last Name']) || lastName || 'Unknown';

        return {
          id: `p-${index}-${Math.random().toString(36).substr(2, 9)}`,
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim(),
          standing: standing as Standing,
          publisherType: publisherType as PublisherType,
          familyId: String(familyId),
          mobile: String(findVal(['Mobile', 'Phone']) || ''),
          email: String(findVal(['Email']) || ''),
          canBeOverseer: standing === 'E',
          canBeAssistant: standing === 'MS' || standing === 'E',
          canSeparateFromFamily: false,
        };
      })
      .filter(p => p.firstName || p.lastName); // Final sanity check

    if (standardized.length === 0) {
      alert("No valid publisher records were found. Please check the file format.");
      return;
    }

    setPublishers(standardized);
    setStep(2);
  };

  const toggleRule = (id: string, field: keyof Pick<Publisher, 'canBeOverseer' | 'canBeAssistant' | 'canSeparateFromFamily'>) => {
    setPublishers(prev => prev.map(p => p.id === id ? { ...p, [field]: !p[field] } : p));
  };

  const handleGenerate = () => {
    const res = generateGroups(publishers, groupsCount);
    setResult(res);
    setStep(4);
  };

  const exportToCSV = () => {
    if (!result) return;
    
    const exportData: any[] = [];
    result.groups.forEach(g => {
      const overseer = publishers.find(p => p.id === g.overseerId);
      const assistant = publishers.find(p => p.id === g.assistantId);
      
      g.publisherIds.forEach(pId => {
        const p = publishers.find(pub => pub.id === pId);
        if (!p) return;
        
        let role = 'Publisher';
        if (pId === g.overseerId) role = 'Group Overseer';
        else if (pId === g.assistantId) role = 'Assistant';

        exportData.push({
          'Group Name': g.name,
          'Role': role,
          'First Name': p.firstName,
          'Last Name': p.lastName,
          'Standing': p.standing,
          'Publisher Type': p.publisherType,
          'Mobile': p.mobile,
          'Email': p.email,
          'Family ID': p.familyId
        });
      });
    });

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Field_Service_Groups_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Helpers ---

  const sortedPublishers = useMemo(() => {
    return [...publishers]
      .filter(p => p.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || p.familyId.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        const valA = String(a[sortField]).toLowerCase();
        const valB = String(b[sortField]).toLowerCase();
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [publishers, searchTerm, sortField, sortOrder]);

  const handleSort = (field: keyof Publisher) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="h-screen w-full grid grid-cols-[260px_1fr_240px] grid-rows-[60px_1fr] bg-bg overflow-hidden font-sans text-text-main selection:bg-accent-light">
      {/* Header */}
      <header className="col-span-3 bg-accent text-white flex items-center justify-between px-5 shadow-md z-50">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-white/20 rounded-sm flex items-center justify-center text-white">
            <Users size={18} />
          </div>
          <div className="flex items-baseline space-x-2">
            <h1 className="text-[15px] font-bold uppercase tracking-wider">Group Builder</h1>
            <span className="text-[13px] font-light opacity-80 border-l border-white/20 pl-2">Congregation Management</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          {publishers.length > 0 && (
            <div className="px-2 py-1 bg-white/10 rounded-[2px] text-[10px] font-bold uppercase tracking-widest border border-white/20">
              {publishers.length} Publishers
            </div>
          )}
          {step > 1 && (
            <button 
              onClick={() => setStep(prev => prev - 1)}
              className="px-3 py-1.5 bg-white text-accent rounded-[3px] text-[12px] font-bold hover:bg-opacity-90 transition-all uppercase"
            >
              Back
            </button>
          )}
          {step === 4 && (
            <button 
              onClick={() => {
                const res = generateGroups(publishers, groupsCount);
                setResult(res);
              }}
              className="px-3 py-1.5 bg-accent border border-white/30 text-white rounded-[3px] text-[12px] font-bold hover:bg-black/10 transition-all uppercase flex items-center space-x-2"
            >
              <RefreshCw size={14} />
              <span>Re-Shuffle</span>
            </button>
          )}
          {step === 4 && (
             <button 
                onClick={exportToCSV}
                className="px-3 py-1.5 bg-white text-accent rounded-[3px] text-[12px] font-bold hover:bg-opacity-90 transition-all uppercase flex items-center space-x-2"
              >
                <Download size={14} />
                <span>Export CSV</span>
              </button>
          )}
        </div>
      </header>

      {/* Sidebar - Publisher Registry */}
      <aside className="bg-sidebar border-r border-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border bg-slate-50/50">
          <h2 className="text-[112px] uppercase font-bold text-text-sub tracking-widest leading-none" style={{ fontSize: '11px' }}>Publisher Registry</h2>
          {step > 1 && (
            <div className="relative mt-3">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-text-sub" size={14} />
              <input 
                type="text" 
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 bg-bg border border-border rounded-[3px] text-[12px] focus:border-accent outline-none"
              />
            </div>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {publishers.length === 0 ? (
            <div className="p-8 text-center space-y-4">
              <div className="w-12 h-12 bg-bg rounded-full flex items-center justify-center mx-auto text-text-sub opacity-50">
                <Users size={24} />
              </div>
              <p className="text-[11px] text-text-sub font-bold uppercase tracking-wider italic">No data imported yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sortedPublishers.map((p) => (
                <div key={p.id} className="p-3 flex items-center gap-2 hover:bg-bg transition-colors">
                  <div className="flex flex-col gap-1 w-6 shrink-0">
                    {p.standing && (
                       <span className={cn(
                        "text-[9px] font-black text-white px-1 py-0.5 rounded-[2px] text-center",
                        p.standing === 'E' ? "bg-role-e" : "bg-role-ms"
                      )}>
                        {p.standing}
                      </span>
                    )}
                    {p.publisherType === 'RP' && (
                      <span className="text-[9px] font-black text-white bg-role-rp px-1 py-0.5 rounded-[2px] text-center">RP</span>
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-medium truncate">{p.lastName}, {p.firstName}</span>
                    <span className="text-[10px] text-text-sub uppercase tracking-wider font-mono truncate opacity-60">{p.familyId}</span>
                  </div>
                  {(p.canBeOverseer === true || p.canBeAssistant === true) && (
                    <div className="ml-auto flex gap-1">
                      {p.canBeOverseer && <span className="w-1.5 h-1.5 rounded-full bg-role-e" title="Can lead" />}
                      {p.canBeAssistant && <span className="w-1.5 h-1.5 rounded-full bg-role-ms" title="Can assist" />}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="bg-bg p-5 overflow-y-auto custom-scrollbar">
        <AnimatePresence mode="wait">
          {/* STEP 1: UPLOAD */}
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col items-center justify-center max-w-xl mx-auto space-y-6"
            >
              <div className="text-center space-y-2">
                <h2 className="text-[20px] font-bold tracking-tight">Import Congregation Data</h2>
                <p className="text-[13px] text-text-sub">Select your publisher list to begin the optimization process.</p>
              </div>

              <div className="w-full relative group">
                <input 
                  type="file" 
                  accept=".csv,.xlsx,.xls" 
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="bg-white border border-border border-dashed rounded-[4px] p-12 transition-all duration-200 group-hover:border-accent group-hover:bg-accent-light/30 flex flex-col items-center space-y-4 shadow-sm">
                  <div className="w-12 h-12 bg-accent-light rounded-[4px] flex items-center justify-center text-accent">
                    <FileText size={24} />
                  </div>
                  <div className="text-center">
                    <p className="text-[14px] font-bold">Import CSV or Excel</p>
                    <p className="text-[11px] text-text-sub font-medium uppercase tracking-widest mt-1">Drop file anywhere</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2: REVIEW */}
          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-5"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                   <h2 className="text-[16px] font-bold uppercase tracking-tight">Data Verification</h2>
                   <div className="bg-accent-light text-accent px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest leading-none">Review Phase</div>
                </div>
              </div>

              <div className="bg-white border border-border rounded-[4px] overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-bg border-b border-border">
                        <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-text-sub italic">Publisher</th>
                        <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-text-sub italic text-center">Can Lead</th>
                        <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-text-sub italic text-center">Can Assist</th>
                        <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-text-sub italic text-center">Split Fam</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sortedPublishers.map((p) => (
                        <tr key={p.id} className="hover:bg-bg transition-colors">
                          <td className="px-3 py-2">
                            <div className="flex items-center space-x-2">
                               <div className="flex flex-col gap-0.5 w-5 shrink-0">
                                {p.standing && (
                                   <span className={cn(
                                    "text-[8px] font-black text-white px-0.5 rounded-[1px] text-center",
                                    p.standing === 'E' ? "bg-role-e" : "bg-role-ms"
                                   )}>
                                    {p.standing}
                                  </span>
                                )}
                                {p.publisherType === 'RP' && (
                                  <span className="text-[8px] font-black text-white bg-role-rp px-0.5 rounded-[1px] text-center lowercase leading-none">rp</span>
                                )}
                              </div>
                              <span className="text-[13px] font-medium">{p.fullName}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-center">
                              <div 
                                onClick={() => toggleRule(p.id, 'canBeOverseer')}
                                className={cn(
                                  "w-8 h-4.5 rounded-full transition-all relative flex items-center px-0.5 cursor-pointer",
                                  p.canBeOverseer ? "bg-success" : "bg-slate-300"
                                )}
                              >
                                <div className={cn(
                                  "w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200",
                                  p.canBeOverseer ? "translate-x-3.5" : "translate-x-0"
                                )} />
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-center">
                              <div 
                                onClick={() => toggleRule(p.id, 'canBeAssistant')}
                                className={cn(
                                  "w-8 h-4.5 rounded-full transition-all relative flex items-center px-0.5 cursor-pointer",
                                  p.canBeAssistant ? "bg-success" : "bg-slate-300"
                                )}
                              >
                                <div className={cn(
                                  "w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200",
                                  p.canBeAssistant ? "translate-x-3.5" : "translate-x-0"
                                )} />
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-center">
                              <div 
                                onClick={() => toggleRule(p.id, 'canSeparateFromFamily')}
                                className={cn(
                                  "w-8 h-4.5 rounded-full transition-all relative flex items-center px-0.5 cursor-pointer",
                                  p.canSeparateFromFamily ? "bg-success" : "bg-slate-300"
                                )}
                              >
                                <div className={cn(
                                  "w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200",
                                  p.canSeparateFromFamily ? "translate-x-3.5" : "translate-x-0"
                                )} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 4: GROUPS */}
          {step === 4 && result && (
            <motion.div 
              key="step4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-2 gap-5 auto-rows-start"
            >
              {result.groups.map((group) => {
                const overseer = publishers.find(p => p.id === group.overseerId);
                const assistant = publishers.find(p => p.id === group.assistantId);
                const members = group.publisherIds.length;
                const pioneerCount = group.publisherIds.filter(pid => publishers.find(p => p.id === pid)?.publisherType === 'RP').length;

                return (
                  <div 
                    key={group.id}
                    className="bg-white border border-border rounded-[4px] p-4 shadow-sm hover:shadow-md transition-all flex flex-col h-full"
                  >
                    <div className="flex justify-between items-center mb-3 border-b border-border pb-2">
                       <h3 className="text-[14px] font-bold uppercase tracking-wide">{group.name}</h3>
                       <div className="flex gap-2 text-[10px] font-bold text-text-sub uppercase">
                          <span>PPL: {members}</span>
                          <span className="text-role-rp">RP: {pioneerCount}</span>
                       </div>
                    </div>

                    <div className="space-y-4 flex-1">
                      <div className="space-y-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase text-text-sub mb-1">Group Overseer</p>
                          <div className={cn(
                            "flex items-center gap-2 text-[13px] font-medium py-1",
                            !overseer && "text-danger italic opacity-70"
                          )}>
                            {overseer ? (
                              <>
                                <span className="tag tag-e text-[9px] px-1 rounded-[2px] bg-role-e text-white font-black">E</span>
                                {overseer.fullName}
                              </>
                            ) : "No Overseer Assigned"}
                          </div>
                        </div>

                        <div>
                          <p className="text-[10px] font-bold uppercase text-text-sub mb-1">Assistant</p>
                          <div className={cn(
                            "flex items-center gap-2 text-[13px] font-medium py-1",
                            !assistant && "text-danger italic opacity-70"
                          )}>
                            {assistant ? (
                              <>
                                <span className={cn(
                                  "text-[9px] px-1 rounded-[2px] text-white font-black",
                                  assistant.standing === 'E' ? "bg-role-e" : "bg-role-ms"
                                )}>
                                  {assistant.standing}
                                </span>
                                {assistant.fullName}
                              </>
                            ) : "No Assistant Assigned"}
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-border pt-3">
                         <p className="text-[10px] font-bold uppercase text-text-sub mb-2">Members</p>
                         <div className="space-y-1.5 overflow-y-auto max-h-[220px] custom-scrollbar pr-2">
                            {/* Grouping families visually in the group card */}
                            {Array.from(new Set(group.publisherIds
                               .map(pid => publishers.find(p => p.id === pid)?.familyId)
                               .filter(fid => fid && group.publisherIds.filter(pid => publishers.find(p => p.id === pid)?.familyId === fid).length > 1)
                            )).map(fid => {
                               const familyMembers = group.publisherIds.filter(pid => publishers.find(p => p.id === pid)?.familyId === fid);
                               const fName = publishers.find(p => p.familyId === fid)?.lastName || 'Family';
                               return (
                                 <div key={fid} className="p-2 bg-bg border-l-3 border-accent rounded-[3px] space-y-1 my-2">
                                    <p className="text-[10px] font-bold text-accent uppercase">{fName} Household</p>
                                    {familyMembers.map(pid => {
                                       const p = publishers.find(pub => pub.id === pid);
                                       if (!p) return null;
                                       return (
                                          <div key={pid} className="flex justify-between items-center text-[12px]">
                                             <span>{p.firstName}</span>
                                             {p.publisherType === 'RP' && <span className="text-[8px] font-bold text-role-rp uppercase">RP</span>}
                                          </div>
                                       );
                                    })}
                                 </div>
                               );
                            })}
                            
                            {group.publisherIds
                              .filter(pid => pid !== group.overseerId && pid !== group.assistantId)
                              .filter(pid => {
                                 const p = publishers.find(pub => pub.id === pid);
                                 if (!p?.familyId) return true;
                                 return group.publisherIds.filter(otherId => publishers.find(pub => pub.id === otherId)?.familyId === p.familyId).length === 1;
                              })
                              .map(pid => {
                                const p = publishers.find(pub => pub.id === pid);
                                if (!p) return null;
                                return (
                                  <div key={pid} className="flex justify-between items-center text-[13px] py-1 border-b border-border border-dotted last:border-b-0">
                                    <div className="flex items-center gap-2">
                                       {p.publisherType === 'RP' && <span className="text-[9px] font-black text-white bg-role-rp px-1 rounded-[1px]">RP</span>}
                                       <span>{p.fullName}</span>
                                    </div>
                                    <span className="text-[9px] text-text-sub opacity-50 font-mono italic">{p.familyId || 'Ind'}</span>
                                  </div>
                                );
                              })}
                         </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Settings Panel */}
      <aside className="bg-sidebar border-l border-border flex flex-col p-4 space-y-6 overflow-y-auto">
        <div className="space-y-4">
           {/* Section 1: Targets */}
           <div className="space-y-3">
              <label className="text-[11px] font-bold text-text-sub uppercase tracking-wider block">Group Targets</label>
              <div className="flex items-center justify-between text-[13px]">
                <span>Target Groups</span>
                <input 
                  type="number" 
                  value={groupsCount} 
                  onChange={(e) => setGroupsCount(Number(e.target.value))}
                  className="w-14 px-2 py-1 border border-border rounded-[3px] text-[13px] font-bold"
                />
              </div>
              <div className="flex items-center justify-between text-[13px]">
                 <span className="text-text-sub">Avg Size</span>
                 <span className="font-bold">{publishers.length > 0 ? Math.ceil(publishers.length / groupsCount) : 0}</span>
              </div>
           </div>

           {/* Section 2: Algorithm Control */}
           <div className="space-y-2 pt-4 border-t border-border">
              <label className="text-[11px] font-bold text-text-sub uppercase tracking-wider block">Algorithm Logic</label>
              <div className="space-y-2.5">
                 {[
                   { label: 'Keep Families', active: true },
                   { label: 'Balance Pioneers', active: true },
                   { label: 'Prioritize Elders', active: true },
                   { label: 'Allow Separables', active: false },
                 ].map((toggle, i) => (
                    <div key={i} className="flex items-center justify-between text-[12px]">
                       <span>{toggle.label}</span>
                       <div className={cn(
                          "w-8 h-4.5 rounded-full relative flex items-center px-0.5",
                          toggle.active ? "bg-success" : "bg-slate-200"
                       )}>
                          <div className={cn(
                            "w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200",
                            toggle.active ? "translate-x-3.5" : "translate-x-0"
                          )} />
                       </div>
                    </div>
                 ))}
              </div>
           </div>

           {/* Section 3: Optimization */}
           <div className="space-y-2 pt-4 border-t border-border">
              <label className="text-[11px] font-bold text-text-sub uppercase tracking-wider block">Optimization Strength</label>
              <select className="w-full px-2 py-2 bg-white border border-border rounded-[3px] text-[12px]">
                 <option>Balanced (Default)</option>
                 <option>Strict Roles</option>
                 <option>Strict Size</option>
              </select>
           </div>
        </div>

        <div className="mt-auto space-y-3 pt-4 border-t border-border">
          {step === 2 && (
            <button 
              onClick={() => setStep(3)}
              className="w-full py-2.5 bg-accent text-white rounded-[3px] text-[12px] font-bold uppercase tracking-wider hover:bg-opacity-90 transition-all shadow-sm"
            >
              Set Settings
            </button>
          )}
          {step === 3 && (
            <button 
              onClick={handleGenerate}
              className="w-full py-2.5 bg-accent text-white rounded-[3px] text-[12px] font-bold uppercase tracking-wider hover:bg-opacity-90 transition-all shadow-sm"
            >
              Generate Groups
            </button>
          )}
          <div className="text-[10px] text-text-sub text-center italic opacity-60">
             Group Builder v1.0.4
          </div>
          {publishers.length > 0 && (
            <button 
              onClick={clearData}
              className="w-full py-2 border border-danger/30 text-danger hover:bg-danger/5 rounded-[3px] text-[10px] font-bold uppercase tracking-widest transition-all mt-4"
            >
              Clear All Data
            </button>
          )}
        </div>
      </aside>

      {/* Inline styles for custom scrollbar */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #dfe1e6;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #c1c7d0;
        }
        .border-l-3 {
          border-left-width: 3px;
        }
      `}</style>
    </div>
  );
}
