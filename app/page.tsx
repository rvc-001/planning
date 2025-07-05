// app/dashboard/page.tsx
"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Loader2, AlertTriangle, CheckCircle, Clock, PackageCheck, XCircle, TrendingUp, Factory, Settings, Calendar as CalendarIcon, Filter } from "lucide-react"
import { format, isWithinInterval, parseISO } from "date-fns" // Added parseISO for date filtering
import { useGoogleSheet, parseGvizDate } from "@/lib/g-sheets" // Import hooks and helper

// Shadcn UI components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils" // For className utility

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  ResponsiveContainer,
} from "recharts"

// --- Constants for Google Sheets ---
const SHEET_ID = "1niKq7rnnWdkH5gWXJIiVJQEsUKgK8qdjLokbo0rmt48"
const PRODUCTION_SHEET = "Production" // Assuming this has basic order data
const JOBCARDS_SHEET = "JobCards" // Contains detailed job card info including statuses
const MASTER_SHEET = "Master" // Contains options for dropdowns
const ACTUAL_PRODUCTION_SHEET = "Actual Production" // Contains actual production data and related statuses

// --- Recharts Pie Chart Colors (Purple-themed) ---
const PIE_COLORS = ['#8A2BE2', '#C7A2E8', '#9B59B6', '#D9BFFC', '#6C3483', '#AE79D2']; // More purple shades
const STATUS_COLORS: { [key: string]: string } = {
  "Completed": "#6c3483", // Darker purple for completed
  "In Progress": "#a78bfa", // Medium purple
  "Pending": "#c084fc",   // Lighter purple
  "Delayed": "#ef4444",    // Red for delayed (kept for alert)
  "Accepted": "#6c3483", // Purple for accepted
  "Pass": "#6c3483", // Purple for pass
  "Rejected": "#ef4444", // Red for rejected/fail
  "Fail": "#ef4444", // Red for fail
  "N/A": "#9ca3af", // Gray for N/A
};

// --- Type Definitions for Raw Data from Sheets (Simplified for Dashboard Use) ---
interface GvizRow {
  c: ({ v: any; f?: string; } | null)[]
}

interface OrderData {
  _rowIndex: number;
  deliveryOrderNo: string;
  firmName: string;
  partyName: string; // col3
  productName: string; // col4
  orderQuantity: number; // col5
  priority: string; // col13 (assuming priority is here)
  crmName: string; // col14 (assuming CRM Name is here)
}

interface JobCardData {
  _rowIndex: number;
  jobCardNo: string; // col1
  deliveryOrderNo: string; // col4
  productName: string; // col6
  dateOfProduction: string; // col8 (for production trends)
  shift: string; // col10
  inTime: string; // col15 (for production complete status)
  outTime: string; // col16 (for production complete status)
  labTest1CompletedAt: string; // col19
  labTest1Status: string; // col22
  labTest2CompletedAt: string; // col30
  labTest2Status: string; // col32
  chemicalTestCompletedAt: string; // col40
  chemicalTestStatus: string; // col42
  tallyTimestamp: string; // col63
}

interface MasterData {
  _rowIndex: number;
  firmName: string; // col0
  supervisorName: string; // col1
  shift: string; // col2
  status: string; // col3 (General Statuses)
  crmName: string; // col6
  priority: string; // col7
  materialName: string; // col9
  flowOfMaterial: string; // col10
  productName: string; // col11
}

interface ActualProductionData {
  _rowIndex: number;
  jobCardNo: string; // col1
  timestamp: string; // col0 (Production Log timestamp)
  actualQuantity: number; // col6 (Actual Produced Quantity)
  machineRunningHour: string; // col9
  verificationTimestamp: string; // col58
  verificationStatus: string; // col60
  tallyTimestamp: string; // col63
  tallyRemarks: string; // col65
}


// Helper function to parse Google's date format
function parseGvizDate(gvizDateString: string | null | undefined): Date | null {
  if (!gvizDateString || typeof gvizDateString !== "string" || !gvizDateString.startsWith("Date(")) return null
  const numbers = gvizDateString.match(/\d+/g)
  if (!numbers || numbers.length < 3) return null
  // Month is 0-indexed in JavaScript Date
  const [year, month, day, hours = 0, minutes = 0, seconds = 0] = numbers.map(Number)
  const date = new Date(year, month, day, hours, minutes, seconds)
  return isNaN(date.getTime()) ? null : date
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // --- Filter States ---
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [partyName, setPartyName] = useState<string>("")
  const [productName, setProductName] = useState<string>("")
  const [shift, setShift] = useState<string>("")
  const [priority, setPriority] = useState<string>("")
  const [crmName, setCrmName] = useState<string>("")
  const [materialName, setMaterialName] = useState<string>("")
  const [flowOfMaterial, setFlowOfMaterial] = useState<string>("")

  // --- Data States ---
  const [allOrders, setAllOrders] = useState<OrderData[]>([])
  const [allJobCards, setAllJobCards] = useState<JobCardData[]>([])
  const [allActualProduction, setAllActualProduction] = useState<ActualProductionData[]>([])

  // --- Dropdown Options States ---
  const [partyOptions, setPartyOptions] = useState<string[]>([])
  const [productOptions, setProductOptions] = useState<string[]>([])
  const [shiftOptions, setShiftOptions] = useState<string[]>([])
  const [priorityOptions, setPriorityOptions] = useState<string[]>([])
  const [crmOptions, setCrmOptions] = useState<string[]>([])
  const [materialOptions, setMaterialOptions] = useState<string[]>([])
  const [flowOptions, setFlowOptions] = useState<string[]>([])


  const { fetchData: fetchProductionData } = useGoogleSheet(PRODUCTION_SHEET, SHEET_ID)
  const { fetchData: fetchJobCardsData } = useGoogleSheet(JOBCARDS_SHEET, SHEET_ID)
  const { fetchData: fetchMasterData } = useGoogleSheet(MASTER_SHEET, SHEET_ID)
  const { fetchData: fetchActualProductionData } = useGoogleSheet(ACTUAL_PRODUCTION_SHEET, SHEET_ID)


  const processGvizTable = useCallback((table: any, rowIndexOffset = 1) => {
    if (!table || !table.rows || table.rows.length === 0) return []
    return table.rows
      .map((row: GvizRow, originalIndex: number) => {
        if (!row.c || !row.c.some((cell) => cell && cell.v !== null && cell.v !== undefined && String(cell.v).trim() !== "")) {
          return null; // Skip empty rows
        }
        const rowData: { [key: string]: any } = { _rowIndex: originalIndex + rowIndexOffset }; // Adjust index based on sheet headers
        row.c.forEach((cell, cellIndex) => {
          rowData[`col${cellIndex}`] = cell && (cell.v !== null && cell.v !== undefined) ? cell.v : null;
        });
        return rowData;
      })
      .filter(Boolean);
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productionTable, jobCardsTable, masterTable, actualProductionTable] = await Promise.all([
        fetchProductionData(),
        fetchJobCardsData(),
        fetchMasterData(),
        fetchActualProductionData(),
      ]);

      const rawProductionData = processGvizTable(productionTable, 1); // Assuming 1 header row
      const rawJobCardsData = processGvizTable(jobCardsTable, 1); // Assuming 1 header row
      const rawMasterData = processGvizTable(masterTable, 1); // Assuming 1 header row
      const rawActualProductionData = processGvizTable(actualProductionTable, 1); // Assuming 1 header row

      // --- Process raw data into usable formats ---
      const processedOrders: OrderData[] = rawProductionData.map((row: any) => ({
        _rowIndex: row._rowIndex,
        deliveryOrderNo: String(row.col1 || ''),
        firmName: String(row.col2 || ''),
        partyName: String(row.col3 || ''),
        productName: String(row.col4 || ''),
        orderQuantity: Number(row.col5 || 0),
        priority: String(row.col13 || ''),
        crmName: String(row.col14 || ''),
      }));
      setAllOrders(processedOrders);

      const processedJobCards: JobCardData[] = rawJobCardsData.map((row: any) => ({
        _rowIndex: row._rowIndex,
        jobCardNo: String(row.col1 || ''),
        deliveryOrderNo: String(row.col4 || ''),
        productName: String(row.col6 || ''),
        dateOfProduction: String(row.col8 || ''),
        shift: String(row.col10 || ''),
        inTime: String(row.col15 || ''), // Start of production
        outTime: String(row.col16 || ''), // End of production
        labTest1CompletedAt: String(row.col19 || ''), // Test 1 (col T)
        labTest1Status: String(row.col22 || ''), // Test 1 Status (col W)
        labTest2CompletedAt: String(row.col30 || ''), // Test 2 (col AE)
        labTest2Status: String(row.col32 || ''), // Test 2 Status (col AG)
        chemicalTestCompletedAt: String(row.col40 || ''), // Chemical Test (col AO)
        chemicalTestStatus: String(row.col42 || ''), // Chemical Test Status (col AQ)
        tallyTimestamp: String(row.col63 || ''), // Tally (col BL)
      }));
      setAllJobCards(processedJobCards);

      const processedActualProduction: ActualProductionData[] = rawActualProductionData.map((row: any) => ({
        _rowIndex: row._rowIndex,
        jobCardNo: String(row.col1 || ''),
        timestamp: String(row.col0 || ''), // Production log creation timestamp
        actualQuantity: Number(row.col6 || 0), // Actual Produced Quantity (col G)
        machineRunningHour: String(row.col9 || ''),
        verificationTimestamp: String(row.col58 || ''), // Verification timestamp (col BG)
        verificationStatus: String(row.col60 || ''), // Verification status (col BI)
        tallyTimestamp: String(row.col63 || ''), // Tally timestamp (col BL)
        tallyRemarks: String(row.col65 || ''), // Tally remarks (col BN)
      }));
      setAllActualProduction(processedActualProduction);


      // --- Populate Filter Options from Master Data ---
      const parties = [...new Set(rawProductionData.map((row: any) => String(row.col3 || '')).filter(Boolean))]; // Party Name from Production Sheet (col3)
      setPartyOptions(parties);
      
      const products = [...new Set(rawProductionData.map((row: any) => String(row.col4 || '')).filter(Boolean))]; // Product Name from Production Sheet (col4)
      setProductOptions(products);

      const shifts = [...new Set(rawMasterData.map((row: any) => String(row.col2 || '')).filter(Boolean))]; // Shift from Master Sheet (col2)
      setShiftOptions(shifts);

      const priorities = [...new Set(rawMasterData.map((row: any) => String(row.col7 || '')).filter(Boolean))]; // Priority from Master Sheet (col7)
      setPriorityOptions(priorities);

      const crms = [...new Set(rawMasterData.map((row: any) => String(row.col6 || '')).filter(Boolean))]; // CRM Name from Master Sheet (col6)
      setCrmOptions(crms);

      const materials = [...new Set(rawMasterData.map((row: any) => String(row.col9 || '')).filter(Boolean))]; // Material Name from Master Sheet (col9)
      setMaterialOptions(materials);

      const flows = [...new Set(rawMasterData.map((row: any) => String(row.col10 || '')).filter(Boolean))]; // Flow of Material from Master Sheet (col10)
      setFlowOptions(flows);

    } catch (err: any) {
      setError(`Failed to load data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [fetchProductionData, fetchJobCardsData, fetchMasterData, fetchActualProductionData, processGvizTable]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);


  // --- Filtered Data based on States ---
  const filteredJobCards = useMemo(() => {
    let filtered = allJobCards;

    if (startDate) {
      filtered = filtered.filter(jc => {
        const prodDate = parseGvizDate(jc.dateOfProduction); // Assuming dateOfProduction is the relevant date for filtering
        return prodDate && prodDate >= startDate;
      });
    }

    if (endDate) {
      filtered = filtered.filter(jc => {
        const prodDate = parseGvizDate(jc.dateOfProduction);
        return prodDate && prodDate <= endDate;
      });
    }

    if (partyName) {
      filtered = filtered.filter(jc => {
        const order = allOrders.find(o => o.deliveryOrderNo === jc.deliveryOrderNo);
        return order && order.partyName === partyName;
      });
    }

    if (productName) {
      filtered = filtered.filter(jc => jc.productName === productName);
    }

    if (shift) {
      filtered = filtered.filter(jc => jc.shift === shift);
    }

    if (priority) {
      filtered = filtered.filter(jc => {
        const order = allOrders.find(o => o.deliveryOrderNo === jc.deliveryOrderNo);
        return order && order.priority === priority;
      });
    }
    
    if (crmName) {
        filtered = filtered.filter(jc => {
            const order = allOrders.find(o => o.deliveryOrderNo === jc.deliveryOrderNo);
            return order && order.crmName === crmName;
        });
    }

    // Material Name and Flow of Material require joining with Actual Production data or other sources if they are there
    // For now, these filters will be no-ops unless relevant data is identified.
    // If they are related to a specific product or job card attribute, that logic would go here.
    if (materialName) {
      // This would require a more complex join or data structure if materialName is not directly on JobCardData
    }

    if (flowOfMaterial) {
      // This would require a more complex join or data structure if flowOfMaterial is not directly on JobCardData
    }

    return filtered;
  }, [allJobCards, startDate, endDate, partyName, productName, shift, priority, crmName, materialName, flowOfMaterial, allOrders]);


  // --- Derived Dashboard Data from Filtered Job Cards ---
  const dashboardProductionData = useMemo(() => {
    // Example: Aggregate monthly production counts from filtered job cards
    const monthlyData: { [key: string]: { production: number, target: number, efficiency: number } } = {};
    const currentYear = new Date().getFullYear();

    filteredJobCards.forEach(jc => {
      const prodDate = parseGvizDate(jc.dateOfProduction);
      if (prodDate && prodDate.getFullYear() === currentYear) { // Filter for current year
        const monthKey = format(prodDate, "MMM");
        monthlyData[monthKey] = monthlyData[monthKey] || { production: 0, target: 150, efficiency: 0 }; // Example target
        monthlyData[monthKey].production += 1; // Count job cards as 'production' units
      }
    });

    const sortedMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return sortedMonths
      .filter(month => Object.keys(monthlyData).includes(month)) // Only show months with data
      .map(month => {
        const data = monthlyData[month];
        const efficiency = (data.production / data.target) * 100;
        return { month, production: data.production, target: data.target, efficiency: parseFloat(efficiency.toFixed(0)) };
      });
  }, [filteredJobCards]);

  const dashboardQualityData = useMemo(() => {
    let labTest1Pass = 0;
    let labTest1Fail = 0;
    let labTest2Pass = 0;
    let labTest2Fail = 0;
    let chemicalTestPass = 0;
    let chemicalTestFail = 0;

    filteredJobCards.forEach(jc => {
      if (jc.labTest1CompletedAt) {
        if (jc.labTest1Status === "Accepted") labTest1Pass++;
        else labTest1Fail++;
      }
      if (jc.labTest2CompletedAt) {
        if (jc.labTest2Status === "Pass") labTest2Pass++;
        else labTest2Fail++;
      }
      if (jc.chemicalTestCompletedAt) {
        if (jc.chemicalTestStatus === "Pass") chemicalTestPass++;
        else chemicalTestFail++;
      }
    });

    const totalTest1 = labTest1Pass + labTest1Fail;
    const totalTest2 = labTest2Pass + labTest2Fail;
    const totalChemical = chemicalTestPass + chemicalTestFail;

    return [
      {
        name: "Lab Test 1",
        pass: totalTest1 > 0 ? parseFloat(((labTest1Pass / totalTest1) * 100).toFixed(0)) : 0,
        fail: totalTest1 > 0 ? parseFloat(((labTest1Fail / totalTest1) * 100).toFixed(0)) : 0,
      },
      {
        name: "Lab Test 2",
        pass: totalTest2 > 0 ? parseFloat(((labTest2Pass / totalTest2) * 100).toFixed(0)) : 0,
        fail: totalTest2 > 0 ? parseFloat(((labTest2Fail / totalTest2) * 100).toFixed(0)) : 0,
      },
      {
        name: "Chemical Test",
        pass: totalChemical > 0 ? parseFloat(((chemicalTestPass / totalChemical) * 100).toFixed(0)) : 0,
        fail: totalChemical > 0 ? parseFloat(((chemicalTestFail / totalChemical) * 100).toFixed(0)) : 0,
      },
    ];
  }, [filteredJobCards]);

  const dashboardOrderStatusData = useMemo(() => {
    let completed = 0; // Tally completed
    let inProgress = 0; // Production started, but not yet verified
    let pending = 0;    // Job Card created, but production not started (no inTime)
    let delayed = 0;    // Production started, but overdue (needs more complex logic or data)

    filteredJobCards.forEach(jc => {
      // Check if Tally is completed (final step)
      if (jc.tallyTimestamp) {
        completed++;
      }
      // Check if Production is started (inTime) but not yet tallied
      else if (jc.inTime && !jc.tallyTimestamp) {
        inProgress++;
      }
      // Check if Job Card exists but production hasn't started
      else if (!jc.inTime) {
        pending++;
      }
      // Delayed logic would require a 'due date' vs 'current status' comparison,
      // which is not readily available in the current simple data structure.
      // For a more realistic 'delayed' count, you'd need a due date field and check if it's passed
      // and the order is still 'in progress' or 'pending'.
    });

    const totalOrders = completed + inProgress + pending + delayed;

    return [
      { name: "Completed", value: completed, color: STATUS_COLORS["Completed"] },
      { name: "In Progress", value: inProgress, color: STATUS_COLORS["In Progress"] },
      { name: "Pending", value: pending, color: STATUS_COLORS["Pending"] },
      { name: "Delayed", value: delayed, color: STATUS_COLORS["Delayed"] }, // This will likely be 0 without specific delay criteria
    ];
  }, [filteredJobCards]);

  const dashboardWeeklyProductionData = useMemo(() => {
    // Example: Aggregate weekly production based on JobCards
    const weeklyCounts: { [key: string]: { orders: number; completed: number } } = {
      "Mon": { orders: 0, completed: 0 },
      "Tue": { orders: 0, completed: 0 },
      "Wed": { orders: 0, completed: 0 },
      "Thu": { orders: 0, completed: 0 },
      "Fri": { orders: 0, completed: 0 },
      "Sat": { orders: 0, completed: 0 },
      "Sun": { orders: 0, completed: 0 },
    };
    const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    filteredJobCards.forEach(jc => {
      const prodDate = parseGvizDate(jc.dateOfProduction);
      if (prodDate) {
        const dayName = daysOfWeek[prodDate.getDay()];
        weeklyCounts[dayName].orders++; // Count every job card as an 'order' for the day
        if (jc.tallyTimestamp) { // If tallied, count as 'completed'
          weeklyCounts[dayName].completed++;
        }
      }
    });

    return daysOfWeek.map(day => ({
      day,
      orders: weeklyCounts[day].orders,
      completed: weeklyCounts[day].completed,
    }));
  }, [filteredJobCards]);

  const totalOrders = useMemo(() => filteredJobCards.length, [filteredJobCards]);
  const totalProductionEfficiency = useMemo(() => {
    const totalTarget = dashboardProductionData.reduce((sum, d) => sum + d.target, 0);
    const totalProduced = dashboardProductionData.reduce((sum, d) => sum + d.production, 0);
    return totalTarget > 0 ? parseFloat(((totalProduced / totalTarget) * 100).toFixed(0)) : 0;
  }, [dashboardProductionData]);

  const totalQualityIssues = useMemo(() => {
    let issues = 0;
    filteredJobCards.forEach(jc => {
      if (jc.labTest1Status === "Rejected" || jc.labTest2Status === "Fail" || jc.chemicalTestStatus === "Fail") {
        issues++;
      }
    });
    return issues;
  }, [filteredJobCards]);

  const totalPendingTests = useMemo(() => {
    let pending = 0;
    filteredJobCards.forEach(jc => {
      if (!jc.labTest1CompletedAt && jc.inTime) pending++; // Test 1 pending after production started
      if (!jc.labTest2CompletedAt && jc.labTest1CompletedAt) pending++; // Test 2 pending after Test 1 completed
      if (!jc.chemicalTestCompletedAt && jc.labTest2CompletedAt) pending++; // Chemical pending after Test 2 completed
    });
    return pending;
  }, [filteredJobCards]);


  const handleResetFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setPartyName("");
    setProductName("");
    setShift("");
    setPriority("");
    setCrmName("");
    setMaterialName("");
    setFlowOfMaterial("");
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-white">
        <Loader2 className="h-12 w-12 animate-spin text-purple-600" />
        <p className="ml-4 text-lg text-gray-700">Loading Dashboard Data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center bg-red-50 text-red-600 rounded-md shadow-md">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <p className="text-lg font-semibold">Error Loading Data</p>
        <p className="text-sm text-gray-700">{error}</p>
        <Button onClick={loadAllData} className="mt-4 bg-purple-600 text-white hover:bg-purple-700">
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white p-4 md:p-6 lg:p-8">
      {/* Header Section */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Production Dashboard</h1>
        <p className="text-lg text-gray-700 max-w-2xl">
          Monitor your production metrics and quality control in real-time
        </p>
      </div>

      {/* Filter Section */}
      <Card className="shadow-md border-none mb-6">
        <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-t-lg">
          <CardTitle className="flex items-center gap-2 text-gray-800">
            <Filter className="h-5 w-5 text-purple-600" /> Filters
          </CardTitle>
          <CardDescription className="text-gray-700">
            Apply filters to refine your dashboard view.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="startDate">Start Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-purple-600" />
                  {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-white">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">End Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-purple-600" />
                  {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-white">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label htmlFor="partyName">Party Name</Label>
            <Select value={partyName} onValueChange={setPartyName}>
              <SelectTrigger>
                <SelectValue placeholder="Select party" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {partyOptions.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="productName">Product Name</Label>
            <Select value={productName} onValueChange={setProductName}>
              <SelectTrigger>
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {productOptions.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="shift">Shift</Label>
            <Select value={shift} onValueChange={setShift}>
              <SelectTrigger>
                <SelectValue placeholder="Select shift" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {shiftOptions.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {priorityOptions.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="crmName">CRM Name</Label>
            <Select value={crmName} onValueChange={setCrmName}>
              <SelectTrigger>
                <SelectValue placeholder="Select CRM" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {crmOptions.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="materialName">Material Name</Label>
            <Select value={materialName} onValueChange={setMaterialName}>
              <SelectTrigger>
                <SelectValue placeholder="Select material" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {materialOptions.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="flowOfMaterial">Flow of Material</Label>
            <Select value={flowOfMaterial} onValueChange={setFlowOfMaterial}>
              <SelectTrigger>
                <SelectValue placeholder="Select flow" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {flowOptions.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4 flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleResetFilters}>
              Reset Filters
            </Button>
            {/* Re-trigger loadAllData to apply filters on existing data states */}
            <Button onClick={loadAllData} className="bg-purple-600 text-white hover:bg-purple-700">
              Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <Card className="shadow-md border-none rounded-lg">
          <CardHeader className="pb-3 sm:pb-2 bg-purple-50 rounded-t-lg">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-700">Total Orders</CardTitle>
              <PackageCheck className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800">{totalOrders}</div>
            <div className="flex items-center mt-2">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-purple-500 mr-1" />
              <p className="text-xs text-purple-600">+XY% from last month</p> {/* Placeholder, needs dynamic calc */}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md border-none rounded-lg">
          <CardHeader className="pb-3 sm:pb-2 bg-purple-50 rounded-t-lg">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-700">Production Efficiency</CardTitle>
              <Factory className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800">{totalProductionEfficiency}%</div>
            <Progress value={totalProductionEfficiency} className="h-2 mt-2 bg-purple-200" indicatorClassName="bg-purple-600" />
            <p className="text-xs text-gray-600 mt-1">Target: 85%</p>
          </CardContent>
        </Card>

        <Card className="shadow-md border-none rounded-lg">
          <CardHeader className="pb-3 sm:pb-2 bg-purple-50 rounded-t-lg">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-700">Quality Issues</CardTitle>
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" />
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800">{totalQualityIssues}</div>
            <div className="flex items-center mt-2">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-green-500 mr-1 rotate-180" /> {/* Kept green for positive trend (reduction) */}
              <p className="text-xs text-green-600">-X% from last week</p> {/* Placeholder */}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md border-none rounded-lg">
          <CardHeader className="pb-3 sm:pb-2 bg-purple-50 rounded-t-lg">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-700">Pending Tests</CardTitle>
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800">{totalPendingTests}</div>
            <div className="flex items-center gap-1 mt-2">
              <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-amber-500" />
              <span className="text-xs text-amber-600">X urgent</span> {/* Placeholder */}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
        {/* Production Trends */}
        <Card className="shadow-md border-none rounded-lg">
          <CardHeader className="pb-4 bg-purple-50 rounded-t-lg">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-800">Production Trends</CardTitle>
            <p className="text-xs sm:text-sm text-gray-700">Monthly production vs targets</p>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[300px]"> {/* Fixed height for chart */}
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboardProductionData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#6b7280" fontSize={12} tick={{ fontSize: 12 }} />
                  <YAxis stroke="#6b7280" fontSize={12} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.95)",
                      border: "none",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="production" fill={STATUS_COLORS["Completed"]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="target" fill={STATUS_COLORS["Pending"]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Order Status Distribution */}
        <Card className="shadow-md border-none rounded-lg">
          <CardHeader className="pb-4 bg-purple-50 rounded-t-lg">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-800">Order Status</CardTitle>
            <p className="text-xs sm:text-sm text-gray-700">Current order distribution</p>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[300px]"> {/* Fixed height for chart */}
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <Pie
                    data={dashboardOrderStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60} // Increased inner radius
                    outerRadius={100} // Increased outer radius
                    paddingAngle={3} // Reduced padding for tighter look
                    dataKey="value"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} // Show label with percentage
                  >
                    {dashboardOrderStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.95)",
                      border: "none",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
        {/* Weekly Production */}
        <Card className="shadow-md border-none rounded-lg">
          <CardHeader className="pb-4 bg-purple-50 rounded-t-lg">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-800">Weekly Production</CardTitle>
            <p className="text-xs sm:text-sm text-gray-700">Orders vs completed this week</p>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[300px]"> {/* Fixed height for chart */}
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboardWeeklyProductionData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" stroke="#6b7280" fontSize={12} tick={{ fontSize: 12 }} />
                  <YAxis stroke="#6b7280" fontSize={12} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.95)",
                      border: "none",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="orders"
                    stackId="1"
                    stroke={STATUS_COLORS["In Progress"]}
                    fill={STATUS_COLORS["In Progress"]}
                    fillOpacity={0.3}
                  />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    stackId="2"
                    stroke={STATUS_COLORS["Completed"]}
                    fill={STATUS_COLORS["Completed"]}
                    fillOpacity={0.6}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Quality Control Results */}
        <Card className="shadow-md border-none rounded-lg">
          <CardHeader className="pb-4 bg-purple-50 rounded-t-lg">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-800">Quality Control</CardTitle>
            <p className="text-xs sm:text-sm text-gray-700">Test results overview</p>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4 sm:space-y-6">
              {dashboardQualityData.map((test, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm font-medium text-gray-700">{test.name}</span>
                    <span className="text-xs sm:text-sm text-gray-600">{test.pass}% Pass Rate</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-purple-600 h-2 rounded-full transition-all duration-300" // Purple progress bar
                        style={{ width: `${test.pass}%` }}
                      ></div>
                    </div>
                    <div className="flex items-center space-x-2 sm:space-x-4 text-xs">
                      <div className="flex items-center">
                        <CheckCircle className="h-3 w-3 text-purple-600 mr-1" /> {/* Purple Check icon */}
                        <span className="text-purple-600">{test.pass}%</span> {/* Purple text */}
                      </div>
                      <div className="flex items-center">
                        <XCircle className="h-3 w-3 text-red-500 mr-1" />
                        <span className="text-red-600">{test.fail}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="shadow-md border-none rounded-lg">
        <CardHeader className="pb-4 bg-purple-50 rounded-t-lg">
          <CardTitle className="text-base sm:text-lg font-semibold text-gray-800">
            Recent Production Activity
          </CardTitle>
          <p className="text-xs sm:text-sm text-gray-700">Latest updates from your production line</p>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-3 sm:space-y-4">
            {/* Example Activity Items - will need to be dynamically populated from data */}
            <div className="flex items-start space-x-3 p-3 sm:p-4 rounded-lg bg-purple-50 border border-purple-200">
              <div className="flex-shrink-0">
                <PackageCheck className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 mt-0.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-purple-800 break-words">
                  Order #DO-2023-0128 completed production
                </p>
                <p className="text-xs text-purple-600 mt-1">2 hours ago • 500 units produced</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 sm:p-4 rounded-lg bg-yellow-50 border border-yellow-200">
              <div className="flex-shrink-0">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500 mt-0.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-yellow-800 break-words">
                  Lab Test pending for Order #DO-2023-0132
                </p>
                <p className="text-xs text-yellow-600 mt-1">3 hours ago • Awaiting quality check</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 sm:p-4 rounded-lg bg-red-50 border border-red-200">
              <div className="flex-shrink-0">
                <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-500 mt-0.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-red-800 break-words">
                  Quality issue detected in Order #DO-2023-0125
                </p>
                <p className="text-xs text-red-600 mt-1">5 hours ago • Requires immediate attention</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}