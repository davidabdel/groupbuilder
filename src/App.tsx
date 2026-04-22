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
  Filter,
  Shield,
  UserCheck,
  UserMinus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as ExcelJS from 'exceljs';
import * as pdfjsLib from 'pdfjs-dist';
import { Publisher, Standing, PublisherType, GroupResult, Group } from './types';
import { generateGroups } from './services/groupLogic';
import { cn } from './lib/utils';

// Set worker for pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

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
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return parsed.map((p: any) => ({
        ...p,
        activityScore: p.activityScore ?? 5
      }));
    } catch (e) {
      return [];
    }
  });
  const [result, setResult] = useState<GroupResult | null>(() => {
    const saved = localStorage.getItem('bmg_result');
    return saved ? JSON.parse(saved) : null;
  });
  const [groupsCount, setGroupsCount] = useState(() => {
    const saved = localStorage.getItem('bmg_groupsCount');
    return saved ? Number(saved) : 10;
  });
  const [mode, setMode] = useState<'full' | 'minor' | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof Publisher>('lastName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [selectedPublisherIds, setSelectedPublisherIds] = useState<string[]>([]);

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
          
          // Find the actual header row
          const headerRowIndex = rawData.findIndex(row => 
            row.some(cell => {
              const c = String(cell).toLowerCase();
              return c.includes('first name') || c.includes('firstname') || c.includes('first_name');
            })
          );

          if (headerRowIndex === -1) {
            Papa.parse(file, {
              header: true,
              skipEmptyLines: true,
              complete: (results) => {
                if (mode === 'minor') processGroupAdjustmentData(results.data);
                else processImportedData(results.data);
              },
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
          
          if (mode === 'minor') processGroupAdjustmentData(mappedData);
          else processImportedData(mappedData);
        },
      });
    } else if (['xlsx', 'xls', 'pdf'].includes(extension || '')) {
      if (extension === 'pdf') {
        processPDFFile(file);
        return;
      }
      // Special handling for Liverpool Grid format / Styled Excel
      if (extension === 'xlsx') {
        const reader = new FileReader();
        reader.onload = async (evt) => {
          const buffer = evt.target?.result as ArrayBuffer;
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(buffer);
          
          const ws = workbook.getWorksheet("Proposed Groups") || workbook.getWorksheet(2) || workbook.getWorksheet(1);
          
          if (ws && isGridFormat(ws)) {
            processLiverpoolGridFile(ws);
            return;
          }

          // Fallback to existing XLSX parser if not grid
          const bstr = new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '');
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const worksheet = wb.Sheets[wsname];
          const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          handleStandardXlsx(rawData, worksheet);
        };
        reader.readAsArrayBuffer(file);
      } else {
        // Legacy XLS handling
        const reader = new FileReader();
        reader.onload = (evt) => {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          handleStandardXlsx(rawData, ws);
        };
        reader.readAsBinaryString(file);
      }
    }
  };

  const isGridFormat = (ws: ExcelJS.Worksheet) => {
    let groupHeaderCount = 0;
    for (let c = 1; c <= 10; c++) {
      const val = String(ws.getCell(1, c).value || '').toLowerCase();
      if (val.includes('group')) groupHeaderCount++;
    }
    return groupHeaderCount >= 3;
  };

  const handleStandardXlsx = (rawData: any[][], ws: XLSX.WorkSheet) => {
    const headerRowIndex = rawData.findIndex(row => 
      Array.isArray(row) && row.some(cell => {
        const c = String(cell || '').toLowerCase();
        return c.includes('first name') || c.includes('firstname') || c.includes('last name') || (c === 'group');
      })
    );

    let finalData: any[];
    if (headerRowIndex !== -1) {
      const headers = rawData[headerRowIndex].map(h => String(h || '').trim());
      finalData = rawData.slice(headerRowIndex + 1).map(row => {
        const obj: any = {};
        if (Array.isArray(row)) {
          headers.forEach((header, i) => {
            if (header) obj[header] = row[i];
          });
        }
        return obj;
      });
    } else {
      finalData = XLSX.utils.sheet_to_json(ws);
    }

    if (mode === 'minor') processGroupAdjustmentData(finalData);
    else processImportedData(finalData);
  };

  const processPDFFile = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const textContent = await page.getTextContent();
      const items = textContent.items as any[];

      if (items.length === 0) {
        alert("No text found in the PDF. It might be a scanned image.");
        return;
      }

      // Sort items by Y (top to bottom) then X (left to right)
      const sortedItems = [...items].sort((a, b) => {
        // Group by Y with 5px tolerance
        if (Math.abs(b.transform[5] - a.transform[5]) < 5) {
          return a.transform[4] - b.transform[4];
        }
        return b.transform[5] - a.transform[5];
      });

      // Find group headers (Row 1)
      const headerItemIndices = sortedItems
        .map((item, idx) => ({ str: item.str.toLowerCase(), idx }))
        .filter(item => item.str.includes('group'))
        .map(item => item.idx);

      if (headerItemIndices.length === 0) {
        alert("Could not find group headers in the PDF.");
        return;
      }

      // Determine column boundaries based on headers
      const columnHeaders = headerItemIndices.map(idx => sortedItems[idx]);
      const columnOffsets = columnHeaders.map(h => h.transform[4]);
      
      const pubs: Publisher[] = [];
      const groupsMap = new Map<number, Group>();

      columnHeaders.forEach((h, i) => {
        groupsMap.set(i, {
          id: `g-${i}-${Math.random().toString(36).substr(2, 4)}`,
          name: h.str,
          overseerId: null,
          assistantId: null,
          publisherIds: []
        });
      });

      // Map other items to groups based on X coordinate
      sortedItems.forEach((item, idx) => {
        if (headerItemIndices.includes(idx)) return;
        const str = item.str.trim();
        if (!str || str.toLowerCase().includes('elders:') || str.toLowerCase().includes('ms:') || str.toLowerCase().includes('pubs:')) return;

        // Find which column this item belongs to
        const x = item.transform[4];
        let bestCol = 0;
        let minDist = Math.abs(x - columnOffsets[0]);
        for (let i = 1; i < columnOffsets.length; i++) {
          const dist = Math.abs(x - columnOffsets[i]);
          if (dist < minDist) {
            minDist = dist;
            bestCol = i;
          }
        }

        // Tolerance for X: if it's way off, it's probably not in a group column
        if (minDist > 100) return;

        let name = str;
        let isOverseer = false;
        let isAssistant = false;

        if (name.includes('(GO)')) {
          isOverseer = true;
          name = name.replace('(GO)', '').trim();
        }
        if (name.includes('(GA)')) {
          isAssistant = true;
          name = name.replace('(GA)', '').trim();
        }
        name = name.replace(/\(\?\)/g, '').trim();

        // Note: Standing detection via color is very hard in PDF.js TextContent
        // We rely on the (GA)/(GO) and manual review for now
        const pId = `p-pdf-${idx}-${Math.random().toString(36).substr(2, 5)}`;
        
        const parts = name.split(' ');
        const lastName = parts.length > 1 ? parts.pop() || '' : name;
        const firstName = parts.join(' ');

        const publisher: Publisher = {
          id: pId,
          firstName,
          lastName,
          fullName: name,
          standing: '', // Unknown from PDF text alone
          publisherType: 'P',
          familyId: lastName || 'Unknown',
          canBeOverseer: false, 
          canBeAssistant: false,
          canSeparateFromFamily: false,
          activityScore: 5
        };

        const group = groupsMap.get(bestCol)!;
        pubs.push(publisher);
        group.publisherIds.push(pId);
        if (isOverseer) group.overseerId = pId;
        if (isAssistant) group.assistantId = pId;
      });

      setPublishers(pubs);
      setResult({
        groups: Array.from(groupsMap.values()),
        unassignedIds: []
      });
      setStep(4);
    } catch (e: any) {
      console.error(e);
      alert(`Error parsing PDF: ${e.message || "Unknown error"}. If this persists, please try the Excel version of the file.`);
    }
  };

  const processLiverpoolGridFile = (worksheet: ExcelJS.Worksheet) => {
    const pubs: Publisher[] = [];
    const groups: Group[] = [];

    // Color helpers
    const parseColor = (cell: ExcelJS.Cell) => {
      const argb = getARGB(cell);
      if (!argb) return null;
      const r = parseInt(argb.substring(argb.length-6, argb.length-4), 16);
      const g = parseInt(argb.substring(argb.length-4, argb.length-2), 16);
      const b = parseInt(argb.substring(argb.length-2), 16);
      return { r, g, b };
    };

    const isElder = (cell: ExcelJS.Cell) => {
      const c = parseColor(cell);
      if (!c) return false;
      // Red: R is high
      if (c.r > 150 && c.g < 100 && c.b < 100) return true; 
      // Orange: R > 200, G > 100
      if (c.r > 200 && c.g > 100 && c.b < 100) return true;
      // Green: G is dominant
      if (c.g > c.r && c.g > c.b && c.g > 120) return true;
      // Light Blue: B and G are high
      if (c.b > 200 && c.g > 150) return true;
      return false;
    };

    const isMS = (cell: ExcelJS.Cell) => {
      const c = parseColor(cell);
      if (!c) return false;
      // Dark Blue: B is dominant
      if (c.b > c.r && c.b > c.g && c.b > 120) return true;
      // Pink: R and B are high
      if (c.r > 200 && c.b > 150) return true;
      return false;
    };

    // Iterate columns for groups
    for (let c = 1; c <= (worksheet.columnCount || 12); c++) {
      const headerVal = String(worksheet.getCell(1, c).value || '').trim();
      if (!headerVal || !headerVal.toLowerCase().includes('group')) continue;

      const group: Group = {
        id: `g-${headerVal}-${Math.random().toString(36).substr(2, 4)}`,
        name: headerVal,
        overseerId: null,
        assistantId: null,
        publisherIds: []
      };

      // Iterate rows
      for (let r = 2; r <= (worksheet.rowCount || 50); r++) {
        const cell = worksheet.getCell(r, c);
        const rawValue = String(cell.value || '').trim();
        if (!rawValue || rawValue.toLowerCase().includes('elders:') || rawValue.toLowerCase().includes('ms:') || rawValue.toLowerCase().includes('pubs:')) continue;

        // Skip crossed out (leaving)
        if (cell.font?.strike) continue;

        let name = rawValue;
        let isOverseer = false;
        let isAssistant = false;

        if (name.includes('(GO)')) {
          isOverseer = true;
          name = name.replace('(GO)', '').trim();
        }
        if (name.includes('(GA)')) {
          isAssistant = true;
          name = name.replace('(GA)', '').trim();
        }
        name = name.replace(/\(\?\)/g, '').trim();

        const standing: Standing = isElder(cell) ? 'E' : (isMS(cell) ? 'MS' : '');
        
        // Name splitting
        const parts = name.split(' ');
        const lastName = parts.length > 1 ? parts.pop() || '' : name;
        const firstName = parts.join(' ');

        const pId = `p-${c}-${r}-${Math.random().toString(36).substr(2, 5)}`;
        const publisher: Publisher = {
          id: pId,
          firstName,
          lastName,
          fullName: name,
          standing,
          publisherType: 'P',
          familyId: lastName || 'Unknown',
          canBeOverseer: standing === 'E',
          canBeAssistant: standing === 'MS' || standing === 'E',
          canSeparateFromFamily: false,
          activityScore: 5
        };

        pubs.push(publisher);
        group.publisherIds.push(pId);
        if (isOverseer) group.overseerId = pId;
        if (isAssistant) group.assistantId = pId;
      }
      groups.push(group);
    }

    if (pubs.length > 0) {
      setPublishers(pubs);
      setResult({
        groups,
        unassignedIds: []
      });
      setStep(4);
    } else {
      alert("No publishers found in the grid format. Please check the file.");
    }
  };

  const processGroupAdjustmentData = (data: any[]) => {
    if (!data || data.length === 0) return;

    const pubs: Publisher[] = [];
    const groupsMap = new Map<string, Group>();

    data.forEach((row, index) => {
      const findVal = (keys: string[]) => {
        const key = Object.keys(row).find(k => 
          keys.some(v => k.toLowerCase().replace(/[\s_]/g, '') === v.toLowerCase().replace(/[\s_]/g, ''))
        );
        return key ? row[key] : '';
      };

      const groupName = findVal(['Group Name', 'Group']);
      if (!groupName) return;

      const firstName = findVal(['First Name', 'FirstName']) || '';
      const lastName = findVal(['Last Name', 'LastName']) || '';
      if (!firstName && !lastName) return;
      const rawRole = String(findVal(['Role'])).toLowerCase();
      let standing = String(findVal(['Standing'])).trim().toUpperCase();
      let publisherType = String(findVal(['Publisher Type', 'PublisherType', 'Publisher'])).trim().toUpperCase();
      const familyId = findVal(['Family ID', 'FamilyID', 'Household Name']) || lastName || 'Unknown';
      
      const pId = `p-${index}-${Math.random().toString(36).substr(2, 9)}`;
      const publisher: Publisher = {
        id: pId,
        firstName: String(firstName),
        lastName: String(lastName),
        fullName: `${firstName} ${lastName}`.trim(),
        standing: standing,
        publisherType: publisherType,
        familyId: String(familyId),
        mobile: String(findVal(['Mobile']) || ''),
        email: String(findVal(['Email']) || ''),
        canBeOverseer: standing === 'E',
        canBeAssistant: standing === 'MS' || standing === 'E',
        canSeparateFromFamily: false,
        activityScore: 5,
      };

      pubs.push(publisher);

      const gNameStr = String(groupName);
      if (!groupsMap.has(gNameStr)) {
        groupsMap.set(gNameStr, {
          id: `g-${gNameStr}-${Math.random().toString(36).substr(2, 4)}`,
          name: gNameStr,
          overseerId: null,
          assistantId: null,
          publisherIds: []
        });
      }

      const group = groupsMap.get(gNameStr)!;
      group.publisherIds.push(pId);
      
      // Automatic role detection for Minor Adjustment if Role column is missing or ambiguous
      // If Role column has 'overseer'/'assistant', use it.
      // Otherwise, the first Elder in the group becomes overseer.
      if (rawRole.includes('overseer')) {
        group.overseerId = pId;
      } else if (rawRole.includes('assistant')) {
        group.assistantId = pId;
      } else if (standing === 'E' && !group.overseerId) {
        group.overseerId = pId;
      } else if ((standing === 'MS' || standing === 'E') && !group.assistantId && group.overseerId !== pId) {
        group.assistantId = pId;
      }
    });

    setPublishers(pubs);
    setResult({
      groups: Array.from(groupsMap.values()),
      unassignedIds: []
    });
    setStep(4);
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
          activityScore: 5,
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

  const togglePioneer = (id: string) => {
    setPublishers(prev => prev.map(p => p.id === id ? { ...p, publisherType: p.publisherType === 'RP' ? 'P' : 'RP' } : p));
  };

  const cycleStanding = (id: string) => {
    setPublishers(prev => prev.map(p => {
      if (p.id !== id) return p;
      let newStanding: Standing = '';
      if (p.standing === '') newStanding = 'E';
      else if (p.standing === 'E') newStanding = 'MS';
      else newStanding = '';
      
      return { 
        ...p, 
        standing: newStanding,
        // Sync these to follow the standing for default logic
        canBeOverseer: newStanding === 'E',
        canBeAssistant: newStanding === 'E' || newStanding === 'MS'
      };
    }));
  };

  const updateName = (id: string, newName: string) => {
    setPublishers(prev => prev.map(p => p.id === id ? { ...p, fullName: newName } : p));
  };

  const toggleRule = (id: string, field: keyof Pick<Publisher, 'canBeOverseer' | 'canBeAssistant' | 'canSeparateFromFamily'>) => {
    setPublishers(prev => prev.map(p => p.id === id ? { ...p, [field]: !p[field] } : p));
  };

  const adjustActivity = (id: string, score: number) => {
    setPublishers(prev => prev.map(p => p.id === id ? { ...p, activityScore: score } : p));
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

  const toggleSelection = (ids: string[]) => {
    setSelectedPublisherIds(prev => {
      const allSelected = ids.every(id => prev.includes(id));
      if (allSelected) {
        return prev.filter(id => !ids.includes(id));
      } else {
        return [...new Set([...prev, ...ids])];
      }
    });
  };

  const handleMoveToGroup = (targetGroupId: string) => {
    if (selectedPublisherIds.length === 0 || !result) return;

    setResult(prev => {
      if (!prev) return null;
      
      const newGroups = prev.groups.map(g => {
        // Remove from any group where they currently exist
        const updatedPublisherIds = g.publisherIds.filter(id => !selectedPublisherIds.includes(id));
        
        // If they were overseer or assistant, we clear that role in the source group
        let newOverseerId = g.overseerId;
        let newAssistantId = g.assistantId;
        if (selectedPublisherIds.includes(g.overseerId || '')) newOverseerId = undefined;
        if (selectedPublisherIds.includes(g.assistantId || '')) newAssistantId = undefined;

        // If this is the target group, add them
        if (g.id === targetGroupId) {
          return {
            ...g,
            publisherIds: [...new Set([...updatedPublisherIds, ...selectedPublisherIds])],
            overseerId: newOverseerId,
            assistantId: newAssistantId
          };
        }

        return {
          ...g,
          publisherIds: updatedPublisherIds,
          overseerId: newOverseerId,
          assistantId: newAssistantId
        };
      });

      return {
        ...prev,
        groups: newGroups,
        unassignedIds: (prev.unassignedIds || []).filter(id => !selectedPublisherIds.includes(id))
      };
    });

    setSelectedPublisherIds([]);
  };

  const handleUnassign = () => {
    if (selectedPublisherIds.length === 0 || !result) return;

    setResult(prev => {
      if (!prev) return null;
      
      const newGroups = prev.groups.map(g => ({
        ...g,
        publisherIds: g.publisherIds.filter(id => !selectedPublisherIds.includes(id)),
        overseerId: selectedPublisherIds.includes(g.overseerId || '') ? undefined : g.overseerId,
        assistantId: selectedPublisherIds.includes(g.assistantId || '') ? undefined : g.assistantId,
      }));

      return {
        ...prev,
        groups: newGroups,
        unassignedIds: [...new Set([...(prev.unassignedIds || []), ...selectedPublisherIds])]
      };
    });

    setSelectedPublisherIds([]);
  };

  const setGroupRole = (groupId: string, pId: string, role: 'overseer' | 'assistant' | 'none') => {
    setResult(prev => {
      if (!prev) return null;
      return {
        ...prev,
        groups: prev.groups.map(g => {
          if (g.id !== groupId) return g;
          return {
            ...g,
            overseerId: role === 'overseer' ? pId : (g.overseerId === pId ? undefined : g.overseerId),
            assistantId: role === 'assistant' ? pId : (g.assistantId === pId ? undefined : g.assistantId),
          };
        })
      };
    });
  };

  const handleBulkScoreUpdate = (score: number) => {
    setPublishers(prev => prev.map(p => 
      selectedPublisherIds.includes(p.id) ? { ...p, activityScore: score } : p
    ));
  };

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
          {/* STEP 1: MODE SELECTION & UPLOAD */}
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col items-center justify-center max-w-xl mx-auto space-y-8"
            >
              {!mode ? (
                <>
                  <div className="text-center space-y-2">
                    <h2 className="text-[20px] font-bold tracking-tight">Select Operation Mode</h2>
                    <p className="text-[13px] text-text-sub">Choose how you want to build your congregation groups.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-6 w-full">
                    <button 
                      onClick={() => setMode('full')}
                      className="flex flex-col items-center justify-center p-8 bg-white border border-border rounded-[4px] hover:border-accent hover:bg-accent-light/30 transition-all space-y-4 shadow-sm group"
                    >
                      <div className="w-12 h-12 bg-accent-light rounded-full flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                        <RefreshCw size={24} />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-[14px]">Full Reshuffle</p>
                        <p className="text-[11px] text-text-sub mt-1">Start from scratch using a publisher list</p>
                      </div>
                    </button>
                    <button 
                      onClick={() => setMode('minor')}
                      className="flex flex-col items-center justify-center p-8 bg-white border border-border rounded-[4px] hover:border-accent hover:bg-accent-light/30 transition-all space-y-4 shadow-sm group"
                    >
                      <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center text-success group-hover:scale-110 transition-transform">
                        <Settings2 size={24} />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-[14px]">Minor Adjustment</p>
                        <p className="text-[11px] text-text-sub mt-1">Update existing groups from a structural export</p>
                      </div>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center space-y-2">
                    <h2 className="text-[20px] font-bold tracking-tight">
                      {mode === 'full' ? 'Import Publisher List' : 'Import Current Group Structure'}
                    </h2>
                    <p className="text-[13px] text-text-sub">
                      {mode === 'full' 
                        ? 'Select your CSV or Excel publisher list to begin.' 
                        : 'Select the exported "Group Adjustments" Excel or PDF file.'}
                    </p>
                    {mode === 'minor' && (
                      <div className="mt-2 text-[11px] text-accent/70 bg-accent-light/50 px-3 py-1.5 rounded-[3px] border border-accent/20 max-w-sm mx-auto">
                        <p><strong>Tip:</strong> The Excel version of the "Proposed Groups" file works best as it contains hidden color-coding for Elders and MS that the app can read automatically!</p>
                      </div>
                    )}
                    <button 
                      onClick={() => setMode(null)}
                      className="text-[11px] font-bold text-accent uppercase tracking-wider hover:underline"
                    >
                      Change Mode
                    </button>
                  </div>

                  <div className="w-full relative group">
                    <input 
                      type="file" 
                      accept=".csv,.xlsx,.xls,.pdf" 
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="bg-white border border-border border-dashed rounded-[4px] p-12 transition-all duration-200 group-hover:border-accent group-hover:bg-accent-light/30 flex flex-col items-center space-y-4 shadow-sm">
                      <div className="w-12 h-12 bg-accent-light rounded-[4px] flex items-center justify-center text-accent">
                        <FileText size={24} />
                      </div>
                      <div className="text-center">
                        <p className="text-[14px] font-bold">Import CSV, Excel or PDF</p>
                        <p className="text-[11px] text-text-sub font-medium uppercase tracking-widest mt-1">Drop file anywhere</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
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
                        <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-text-sub italic text-center">Pioneer</th>
                        <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-text-sub italic text-center">Split Fam</th>
                        <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-text-sub italic text-center whitespace-nowrap">Activity (1-5)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sortedPublishers.map((p) => (
                        <tr key={p.id} className="hover:bg-bg transition-colors">
                          <td className="px-3 py-2">
                            <div className="flex items-center space-x-2">
                               <div className="flex flex-col gap-0.5 w-5 shrink-0">
                                 <button 
                                   onClick={() => cycleStanding(p.id)}
                                   className={cn(
                                    "text-[8px] font-black text-white px-0.5 rounded-[1px] text-center min-h-[12px] flex items-center justify-center transition-all",
                                    p.standing === 'E' ? "bg-role-e" : p.standing === 'MS' ? "bg-role-ms" : "bg-slate-200 text-slate-400 hover:bg-slate-300"
                                   )}
                                   title="Click to cycle role (Elder, MS, None)"
                                 >
                                    {p.standing || '.'}
                                  </button>
                                {p.publisherType === 'RP' && (
                                  <span className="text-[8px] font-black text-white bg-role-rp px-0.5 rounded-[1px] text-center lowercase leading-none">rp</span>
                                )}
                              </div>
                              <input 
                                type="text"
                                value={p.fullName}
                                onChange={(e) => updateName(p.id, e.target.value)}
                                className="text-[13px] font-medium bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:bg-white outline-none px-1 py-0.5 w-full transition-all"
                              />
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
                               <button 
                                onClick={() => togglePioneer(p.id)}
                                className={cn(
                                  "px-2 py-0.5 rounded-[2px] text-[9px] font-black uppercase tracking-widest border transition-all",
                                  p.publisherType === 'RP' 
                                    ? "bg-role-rp text-white border-role-rp" 
                                    : "bg-transparent text-text-sub border-border hover:border-text-sub"
                                )}
                              >
                                RP
                              </button>
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
                          <td className="px-3 py-2">
                            <div className="flex justify-center space-x-1">
                              {[1, 2, 3, 4, 5].map(score => (
                                <button
                                  key={score}
                                  onClick={() => adjustActivity(p.id, score)}
                                  className={cn(
                                    "w-5 h-5 rounded-[2px] text-[10px] font-bold transition-all",
                                    p.activityScore === score 
                                      ? "bg-accent text-white" 
                                      : "bg-bg text-text-sub hover:bg-accent-light"
                                  )}
                                >
                                  {score}
                                </button>
                              ))}
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

          {step === 3 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col items-center justify-center max-w-xl mx-auto space-y-8"
            >
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-accent-light rounded-full flex items-center justify-center text-accent mx-auto">
                  <Settings2 size={32} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-[20px] font-bold tracking-tight">Configuration Ready</h2>
                  <p className="text-[13px] text-text-sub">
                    You've reviewed {publishers.length} publishers. Now, use the sidebar settings to fine-tune the group generation.
                  </p>
                </div>
              </div>

              <div className="w-full bg-white border border-border rounded-[4px] p-6 shadow-sm space-y-4 text-[13px]">
                <div className="flex justify-between border-b border-border pb-3">
                  <span className="text-text-sub font-medium">Total Publishers</span>
                  <span className="font-bold">{publishers.length}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-3">
                  <span className="text-text-sub font-medium">Target Groups</span>
                  <span className="font-bold text-accent">{groupsCount}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-3">
                  <span className="text-text-sub font-medium">Avg Group Size</span>
                  <span className="font-bold text-accent">{Math.ceil(publishers.length / groupsCount)} publishers</span>
                </div>
                <div className="pt-2 text-[11px] text-text-sub italic text-center">
                  Once you're ready, click "Generate Groups" in the bottom right.
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 4: GROUPS DASHBOARD */}
          {step === 4 && result && (
            <motion.div 
              key="step4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-4 h-[calc(100vh-140px)]"
            >
              {/* Toolbar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <h2 className="text-[18px] font-bold uppercase tracking-tight">Group Dashboard</h2>
                   {selectedPublisherIds.length > 0 && (
                     <div className="flex gap-2 items-center">
                        <span className="bg-accent text-white px-2 py-0.5 rounded text-[10px] font-bold">{selectedPublisherIds.length} Selected</span>
                        <button onClick={() => setSelectedPublisherIds([])} className="text-[10px] font-bold text-text-sub uppercase hover:underline">Clear</button>
                        <button onClick={handleUnassign} className="text-[10px] font-bold text-danger uppercase hover:underline">Unassign</button>
                     </div>
                   )}
                </div>
              </div>

              {/* Grid Dashboard */}
              <div className="flex gap-4 overflow-x-auto pb-4 items-start h-full scroll-smooth">
                {result.groups.map((group) => {
                  const eldersCount = group.publisherIds.filter(pid => publishers.find(p => p.id === pid)?.standing === 'E').length;
                  const msCount = group.publisherIds.filter(pid => publishers.find(p => p.id === pid)?.standing === 'MS').length;
                  const totalPubs = group.publisherIds.length;

                  return (
                    <div 
                      key={group.id}
                      className="bg-white border border-border rounded-[4px] shadow-sm flex flex-col w-[260px] shrink-0 h-full overflow-hidden"
                    >
                      {/* Group Header */}
                      <div className="p-3 border-b border-border bg-slate-50 sticky top-0 z-10">
                        <div className="flex justify-between items-center mb-1">
                          <h3 className="text-[12px] font-black uppercase tracking-widest text-accent truncate">{group.name}</h3>
                          {selectedPublisherIds.length > 0 && !group.publisherIds.some(id => selectedPublisherIds.includes(id)) && (
                            <button 
                              onClick={() => handleMoveToGroup(group.id)}
                              className="text-[9px] font-black bg-accent text-white px-1.5 py-0.5 rounded-[2px] uppercase"
                            >
                              Move
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Publisher List */}
                      <div className="flex-1 overflow-y-auto p-1.5 space-y-1 custom-scrollbar">
                        {group.publisherIds.map((pid) => {
                          const p = publishers.find(x => x.id === pid);
                          if (!p) return null;
                          const isSelected = selectedPublisherIds.includes(pid);

                          return (
                            <div 
                              key={pid}
                              onClick={() => toggleSelection([pid])}
                              className={cn(
                                "group/member relative p-2 rounded-[3px] border transition-all cursor-pointer flex flex-col gap-1",
                                isSelected ? "bg-accent-light border-accent ring-1 ring-accent" : "bg-white border-transparent hover:border-border hover:bg-bg"
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 overflow-hidden">
                                  <span className={cn(
                                    "text-[13px] font-bold tracking-tight truncate",
                                    p.standing === 'E' ? "text-danger" : p.standing === 'MS' ? "text-accent" : "text-text-main"
                                  )}>
                                    {p.fullName}
                                  </span>
                                  {p.id === group.overseerId && <span className="text-[9px] font-black text-danger uppercase opacity-80 shrink-0">(GO)</span>}
                                  {p.id === group.assistantId && <span className="text-[9px] font-black text-accent uppercase opacity-80 shrink-0">(GA)</span>}
                                </div>
                                {p.publisherType === 'RP' && (
                                  <span className="text-[8px] font-black text-white bg-role-rp px-1 rounded-[1px]">RP</span>
                                )}
                              </div>

                              {/* Controls */}
                              <div className="flex items-center justify-between opacity-0 group-hover/member:opacity-100 transition-opacity">
                                <div className="flex gap-1">
                                  <button onClick={(e) => { e.stopPropagation(); setGroupRole(group.id, pid, 'overseer'); }} className={cn("text-[8px] font-bold px-1 rounded-[1px] uppercase", group.overseerId === pid ? "bg-danger text-white" : "text-text-sub hover:bg-danger/10")}>GO</button>
                                  <button onClick={(e) => { e.stopPropagation(); setGroupRole(group.id, pid, 'assistant'); }} className={cn("text-[8px] font-bold px-1 rounded-[1px] uppercase", group.assistantId === pid ? "bg-accent text-white" : "text-text-sub hover:bg-accent/10")}>GA</button>
                                  <button onClick={(e) => { e.stopPropagation(); togglePioneer(pid); }} className="text-[8px] font-bold px-1 rounded-[1px] uppercase text-text-sub hover:bg-role-rp/10">RP</button>
                                </div>
                                <div className="flex gap-0.5">
                                  {[1, 2, 3, 4, 5].map(s => (
                                    <button key={s} onClick={(e) => { e.stopPropagation(); adjustActivity(pid, s); }} className={cn("w-3 h-3 rounded-[1px] text-[7px] font-bold flex items-center justify-center", p.activityScore === s ? "bg-accent text-white" : "bg-slate-100 text-slate-400")}>{s}</button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Sticky Footer Stats */}
                      <div className="p-3 border-t border-border bg-slate-50 text-[10px] font-black text-text-sub uppercase tracking-wider space-y-1">
                        <div className="flex justify-between border-b border-border/50 pb-1">
                          <span>Elders</span>
                          <span className={cn(eldersCount >= 2 ? "text-success" : "text-danger")}>{eldersCount}</span>
                        </div>
                        <div className="flex justify-between border-b border-border/50 pb-1">
                          <span>Min Servants</span>
                          <span className={cn(msCount >= 1 ? "text-success" : "text-warning")}>{msCount}</span>
                        </div>
                        <div className="flex justify-between pt-0.5 text-accent">
                          <span>Total Pubs</span>
                          <span>{totalPubs}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Unassigned Pool as a Column */}
                {result.unassignedIds && result.unassignedIds.length > 0 && (
                  <div className="bg-bg border border-danger/30 rounded-[4px] shadow-sm flex flex-col w-[260px] shrink-0 h-full overflow-hidden">
                    <div className="p-3 border-b border-danger/20 bg-danger/5 sticky top-0 z-10 flex justify-between items-center">
                       <h3 className="text-[12px] font-black uppercase tracking-widest text-danger">Unassigned Pool</h3>
                       <div className="bg-danger text-white text-[9px] px-1.5 rounded-full font-black">{result.unassignedIds.length}</div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-1.5 space-y-1 custom-scrollbar">
                      {result.unassignedIds.map(pid => {
                        const p = publishers.find(x => x.id === pid);
                        if (!p) return null;
                        return (
                          <div 
                            key={pid} 
                            onClick={() => toggleSelection([pid])} 
                            className={cn(
                              "p-2 border rounded-[3px] transition-all cursor-pointer bg-white text-[13px] font-medium flex items-center justify-between", 
                              selectedPublisherIds.includes(pid) ? "border-accent bg-accent-light shadow-sm" : "border-border hover:border-accent/40"
                            )}
                          >
                            <span>{p.fullName}</span>
                            <span className="text-[9px] text-text-sub opacity-50">{p.standing}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
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
