// app/production/page.tsx

"use client"


import React, { useState, useEffect, useCallback, useMemo } from "react"

import { Loader2, AlertTriangle, Settings, Plus, X, Factory, History, Eye } from "lucide-react"

import { format } from "date-fns"

import { useGoogleSheet, parseGvizDate } from "@/lib/g-sheets"


// Shadcn UI components

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { Button } from "@/components/ui/button"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

import { Input } from "@/components/ui/input"

import { Label } from "@/components/ui/label"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { Badge } from "@/components/ui/badge"

import { Checkbox } from "@/components/ui/checkbox"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"


// Type Definitions

interface RawMaterial {

    name: string;

    quantity: number | string;

}


interface ProductionItem {

  _rowIndex: number;

  jobCardNo: string;

  firmName: string;

  supervisorName: string;

  deliveryOrderNo: string;

  partyName: string;

  productName: string;

  orderQuantity: number;

  dateOfProduction: string;

  shift: string;

  notes: string;

  quantity: number;

  expectedDeliveryDate: string;

  priority: string;

  actualQuantity: number;

}


interface HistoryItem extends ProductionItem {

    rawMaterials: RawMaterial[];

    machineHours: string;

}


// Constants

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwpDkP_Wmk8udmH6XsWPvpXgj-e3rGNxNJlOdAVXEWiCJWh3LI8CjIH4oJW5k5pjKFCvg/exec"

const JOBCARDS_SHEET = "JobCards"

const MASTER_SHEET = "Master"

const PRODUCTION_DATA_SHEET = "Actual Production"


// Column Definitions

const PENDING_COLUMNS_META = [

  { header: "Action", dataKey: "actionColumn", alwaysVisible: true, toggleable: false },

  { header: "Job Card No.", dataKey: "jobCardNo", alwaysVisible: true, toggleable: false },

  { header: "Delivery Order No.", dataKey: "deliveryOrderNo", toggleable: true },

  { header: "Quantity", dataKey: "quantity", toggleable: true },

  { header: "Expected Delivery Date", dataKey: "expectedDeliveryDate", toggleable: true },

  { header: "Priority", dataKey: "priority", toggleable: true },

  { header: "Date of Production", dataKey: "dateOfProduction", toggleable: true },

  { header: "Supervisor Name", dataKey: "supervisorName", toggleable: true },

  { header: "Shift", dataKey: "shift", toggleable: true },

  { header: "Notes", dataKey: "notes", toggleable: true },

]


const HISTORY_COLUMNS_META = [

  { header: "Job Card No.", dataKey: "jobCardNo", alwaysVisible: true, toggleable: false },

  { header: "Delivery Order No.", dataKey: "deliveryOrderNo", toggleable: true },

  { header: "Actual Quantity", dataKey: "actualQuantity", toggleable: true },

  { header: "Expected Delivery Date", dataKey: "expectedDeliveryDate", toggleable: true },

  { header: "Priority", dataKey: "priority", toggleable: true },

  { header: "Date of Production", dataKey: "dateOfProduction", toggleable: true },

  { header: "Supervisor Name", dataKey: "supervisorName", toggleable: true },

  { header: "Shift", dataKey: "shift", toggleable: true },

  { header: "Raw Materials", dataKey: "rawMaterials", toggleable: true },

  { header: "Machine Hours", dataKey: "machineHours", toggleable: true },

  { header: "Notes", dataKey: "notes", toggleable: true },

]


const initialFormData = {

  quantityFG: "",

  rawMaterials: [] as RawMaterial[],

  machineRunningHour: "",

}


export default function ProductionPage() {

  const [pendingProductions, setPendingProductions] = useState<ProductionItem[]>([])

  const [historyProductions, setHistoryProductions] = useState<HistoryItem[]>([])

  const [materialsList, setMaterialsList] = useState<string[]>([])

  const [loading, setLoading] = useState(true)

  const [isSubmitting, setIsSubmitting] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const [selectedJobCard, setSelectedJobCard] = useState<ProductionItem | null>(null)

  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const [activeTab, setActiveTab] = useState("pending")

  const [visiblePendingColumns, setVisiblePendingColumns] = useState<Record<string, boolean>>({})

  const [visibleHistoryColumns, setVisibleHistoryColumns] = useState<Record<string, boolean>>({})

  const [formData, setFormData] = useState(initialFormData)

  const [newMaterial, setNewMaterial] = useState({ name: "", quantity: "" })

  const [formErrors, setFormErrors] = useState<Record<string, string | null>>({})

  const [viewingMaterials, setViewingMaterials] = useState<RawMaterial[] | null>(null)


  const { fetchData: fetchJobCardsData } = useGoogleSheet(JOBCARDS_SHEET)

  const { fetchData: fetchMasterData } = useGoogleSheet(MASTER_SHEET)

  const { fetchData: fetchProductionData } = useGoogleSheet(PRODUCTION_DATA_SHEET)


  useEffect(() => {

    const initializeVisibility = (columnsMeta: any[]) => {

      const visibility: Record<string, boolean> = {}

      columnsMeta.forEach((col) => {

        visibility[col.dataKey] = col.alwaysVisible !== false

      })

      return visibility

    }

    setVisiblePendingColumns(initializeVisibility(PENDING_COLUMNS_META))

    setVisibleHistoryColumns(initializeVisibility(HISTORY_COLUMNS_META))

  }, [])


  const loadAllData = useCallback(async () => {

    setLoading(true)

    setError(null)

    try {

      const [jobCardsTable, masterTable, productionTable] = await Promise.all([

        fetchJobCardsData(),

        fetchMasterData(),

        fetchProductionData(),

      ]);

      

      // --- CHANGE: This function now conditionally slices the header row ---

      const processGvizTable = (table: any, hasHeader = true) => {

          if (!table || !table.rows || table.rows.length < 1) return [];

          

          const rowsToProcess = hasHeader ? table.rows.slice(1) : table.rows;

          const rowIndexOffset = hasHeader ? 2 : 1;


          return rowsToProcess.map((row: any, index: number) => {

              if (!row.c || !row.c.some((cell: any) => cell && cell.v !== null)) return null;

              const rowData: any = { _rowIndex: index + rowIndexOffset };

              table.cols.forEach((col: any, cellIndex: number) => {

                  const colId = col.id || `col${cellIndex}`;

                  const cell = row.c[cellIndex];

                  rowData[colId] = cell ? cell.v : null;

              });

              return rowData;

          }).filter(Boolean);

      }


      // Process sheets that have a header

      const jobCardDataRows = processGvizTable(jobCardsTable);

      const actualProductionRecords = processGvizTable(productionTable).map(row => {

          const materials: RawMaterial[] = [];

          for (let i = 0; i < 20; i++) {

              const name = row[`col${8 + (i * 2)}`];

              const quantity = row[`col${9 + (i * 2)}`];

              if (name) {

                  materials.push({ name: String(name), quantity: quantity || 0 });

              }

          }

          return {

              jobCardNo: String(row.col1 || ""),

              actualQuantity: Number(row.col6 || 0),

              machineHours: String(row.col48 || ""),

              rawMaterials: materials,

          };

      });

      

      // --- CHANGE: Process Master sheet without slicing the header, as it contains data ---

      const masterDataRows = processGvizTable(masterTable, false);


      const pendingFiltered = jobCardDataRows.filter((row: any) => (row.P !== null && String(row.P).trim() !== "") && (!row.Q || String(row.Q).trim() === ""));

      const pending: ProductionItem[] = pendingFiltered.map((row: any) => ({

        _rowIndex: row._rowIndex,

        jobCardNo: String(row.B || ""),

        firmName: String(row.C || ""),

        supervisorName: String(row.D || ""),

        deliveryOrderNo: String(row.E || ""),

        partyName: String(row.F || ""),

        productName: String(row.G || ""),

        orderQuantity: Number(row.H || 0),

        dateOfProduction: row.I ? format(parseGvizDate(row.I), "dd/MM/yyyy") : "",

        shift: String(row.J || ""),

        notes: String(row.O || ""),

        quantity: Number(row.H || 0),

        expectedDeliveryDate: row.M ? format(parseGvizDate(row.M), "dd/MM/yyyy") : "",

        priority: String(row.L || ""),

        actualQuantity: Number(row.K || 0),

      }));

      setPendingProductions(pending);


      const historyFiltered = jobCardDataRows.filter((row: any) => (row.P !== null && String(row.P).trim() !== "") && (row.Q !== null && String(row.Q).trim() !== ""));

      const history: HistoryItem[] = historyFiltered.map((row: any) => {

          const productionData = actualProductionRecords.find(p => p.jobCardNo === row.B) || { actualQuantity: Number(row.K || 0), machineHours: "-", rawMaterials: []};

          return {

              _rowIndex: row._rowIndex,

              jobCardNo: String(row.B || ""),

              deliveryOrderNo: String(row.E || ""),

              actualQuantity: productionData.actualQuantity,

              expectedDeliveryDate: row.M ? format(parseGvizDate(row.M), "dd/MM/yyyy") : "",

              priority: String(row.L || ""),

              dateOfProduction: row.I ? format(parseGvizDate(row.I), "dd/MM/yyyy") : "",

              supervisorName: String(row.D || ""),

              shift: String(row.J || ""),

              rawMaterials: productionData.rawMaterials,

              machineHours: productionData.machineHours,

              notes: String(row.O || ""),

              firmName: String(row.C || ""),

              partyName: String(row.F || ""),

              productName: String(row.G || ""),

              orderQuantity: Number(row.H || 0),

              quantity: Number(row.H || 0),

          }

      });

      setHistoryProductions(history.sort((a,b) => b._rowIndex - a._rowIndex));

      

      const materials: string[] = [...new Set(masterDataRows.map((row: any) => String(row.J || "")).filter(Boolean))]

      setMaterialsList(materials);


    } catch (err: any) {

      setError(`Failed to load data. Error: ${err.message}`);

    } finally {

      setLoading(false);

    }

  }, [fetchJobCardsData, fetchMasterData, fetchProductionData]);


  useEffect(() => { loadAllData() }, [loadAllData]);


  const handleOpenDialog = (jobCard: ProductionItem) => {

    setSelectedJobCard(jobCard)

    setFormData(initialFormData)

    setNewMaterial({ name: "", quantity: "" })

    setFormErrors({})

    setIsDialogOpen(true)

  }


  const handleAddMaterial = () => {

    if (newMaterial.name && newMaterial.quantity && Number(newMaterial.quantity) > 0 && formData.rawMaterials.length < 20) {

      setFormData((prev) => ({ ...prev, rawMaterials: [...prev.rawMaterials, {name: newMaterial.name, quantity: newMaterial.quantity}] }))

      setNewMaterial({ name: "", quantity: "" })

    }

  }


  const handleRemoveMaterial = (index: number) => {

    setFormData((prev) => ({ ...prev, rawMaterials: prev.rawMaterials.filter((_, i) => i !== index) }))

  }


  const validateForm = () => {

    const errors: Record<string, string> = {}

    if (!formData.quantityFG || Number(formData.quantityFG) <= 0) errors.quantityFG = "Valid Finished Goods quantity is required."

    if (formData.rawMaterials.length === 0) errors.rawMaterials = "At least one raw material is required."

    

    const timeRegex = /^(?:2[0-3]|[01]?[0-9]):[0-5]?[0-9]:[0-5]?[0-9]$/;

    if (!formData.machineRunningHour || !timeRegex.test(formData.machineRunningHour)) {

        errors.machineRunningHour = "Machine running hour must be in HH:MM:SS format.";

    }

    setFormErrors(errors)

    return Object.keys(errors).length === 0

  }


  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {

    e.preventDefault()

    if (!validateForm()) return


    if (!selectedJobCard || !selectedJobCard.jobCardNo) {

      alert("Error: Missing job card details. Please refresh.")

      return

    }


    setIsSubmitting(true)


    try {

      const prodData = await fetchProductionData();

      let lastSerialNumber = 0;

      if (prodData && prodData.rows.length > 0) {

        const lastRow = prodData.rows[prodData.rows.length - 1];

        const lastSerialCell = lastRow.c[7];

        if (lastSerialCell && typeof lastSerialCell.v === 'number') {

          lastSerialNumber = lastSerialCell.v;

        }

      }

      const newSerialNumber = lastSerialNumber + 1;


      const timestamp = format(new Date(), "dd/MM/yyyy HH:mm:ss")

      const rawMaterialsData: (string | number)[] = []

      for (let i = 0; i < 20; i++) {

        if (formData.rawMaterials[i]) {

          rawMaterialsData.push(formData.rawMaterials[i].name)

          rawMaterialsData.push(formData.rawMaterials[i].quantity)

        } else {

          rawMaterialsData.push("")

          rawMaterialsData.push("")

        }

      }


      const productionRowData = [

        timestamp,

        selectedJobCard.jobCardNo,

        selectedJobCard.firmName,

        selectedJobCard.dateOfProduction,

        selectedJobCard.supervisorName,

        selectedJobCard.productName,

        formData.quantityFG,

        newSerialNumber,

        ...rawMaterialsData,

        formData.machineRunningHour,

      ]


      const addBody = new URLSearchParams({

        action: "insert",

        sheetName: PRODUCTION_DATA_SHEET,

        rowData: JSON.stringify(productionRowData),

      });

      const addRes = await fetch(WEB_APP_URL, { method: "POST", body: addBody });

      const addResult = await addRes.json();

      if (!addResult.success) {

        throw new Error(addResult.error || "Failed to save production data.");

      }


      const updateBody = new URLSearchParams({

        action: 'update',

        sheetName: JOBCARDS_SHEET,

        rowIndex: selectedJobCard._rowIndex.toString(),

        rowData: JSON.stringify(Array(16).fill('').concat([timestamp])) 

      });

      await fetch(WEB_APP_URL, { method: "POST", body: updateBody });


      alert("Production data saved successfully!")

      setIsDialogOpen(false)

      await loadAllData()

    } catch (err: any) {

      setError(err.message)

      alert(`Error: ${err.message}`)

    } finally {

      setIsSubmitting(false)

    }

  }


  const ColumnToggler = ({ tab, columnsMeta }: { tab: string, columnsMeta: any[] }) => (

    <Popover>

      <PopoverTrigger asChild>

        <Button variant="outline" size="sm" className="h-8 text-xs bg-transparent ml-auto">

          <Settings className="mr-1.5 h-3.5 w-3.5" />

          View Columns

        </Button>

      </PopoverTrigger>

      <PopoverContent className="w-[220px] p-3">

        <div className="grid gap-2">

          <p className="text-sm font-medium">Toggle Columns</p>

          <div className="flex items-center justify-between mt-1 mb-2">

            <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => handleSelectAllColumns(tab, columnsMeta, true)}>Select All</Button>

            <span className="text-gray-300 mx-1">|</span>

            <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => handleSelectAllColumns(tab, columnsMeta, false)}>Deselect All</Button>

          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto">

            {columnsMeta

              .filter((col) => col.toggleable)

              .map((col) => (

                <div key={`toggle-${tab}-${col.dataKey}`} className="flex items-center space-x-2">

                  <Checkbox id={`toggle-${tab}-${col.dataKey}`} checked={tab === "pending" ? !!visiblePendingColumns[col.dataKey] : !!visibleHistoryColumns[col.dataKey]} onCheckedChange={(checked) => handleToggleColumn(tab, col.dataKey, Boolean(checked))} />

                  <Label htmlFor={`toggle-${tab}-${col.dataKey}`} className="text-xs font-normal cursor-pointer">{col.header}</Label>

                </div>

              ))}

          </div>

        </div>

      </PopoverContent>

    </Popover>

  )

  

  const handleToggleColumn = (tab: string, dataKey: string, checked: boolean) => {

    const setter = tab === "pending" ? setVisiblePendingColumns : setVisibleHistoryColumns;

    setter((prev) => ({ ...prev, [dataKey]: checked }));

  };


  const handleSelectAllColumns = (tab: string, columnsMeta: any[], checked: boolean) => {

    const newVisibility: Record<string, boolean> = {};

    columnsMeta.forEach((col) => {

      if (col.toggleable) newVisibility[col.dataKey] = checked;

    });

    const setter = tab === "pending" ? setVisiblePendingColumns : setVisibleHistoryColumns;

    setter((prev) => ({ ...prev, ...newVisibility }));

  };


  const visiblePendingColumnsMeta = useMemo(() => PENDING_COLUMNS_META.filter((col) => visiblePendingColumns[col.dataKey]), [visiblePendingColumns]);

  const visibleHistoryColumnsMeta = useMemo(() => HISTORY_COLUMNS_META.filter((col) => visibleHistoryColumns[col.dataKey]), [visibleHistoryColumns]);


  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="h-12 w-12 animate-spin text-purple-600" /><p className="ml-4 text-lg">Loading Production Data...</p></div>

  if (error) return <div className="p-8 text-center text-red-600 bg-red-50 rounded-md"><AlertTriangle className="h-12 w-12 mx-auto mb-4" /><p className="text-lg font-semibold">Error Loading Data</p><p className="text-sm">{error}</p><Button onClick={loadAllData} className="mt-4">Retry</Button></div>


  const renderRawMaterials = (materials: RawMaterial[]) => {

    if (!materials || materials.length === 0) return "-";

    if (materials.length <= 2) {

      return materials.map(m => m.name).join(', ');

    }

    return (

      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setViewingMaterials(materials)}>

        <Eye className="h-3.5 w-3.5 mr-1.5" />

        View ({materials.length})

      </Button>

    );

  };


  return (

    <div className="space-y-6 p-2 md:p-6 bg-gray-50 min-h-screen">

      <Card className="shadow-lg border-none">

        <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-100 rounded-t-lg">

          <CardTitle className="flex items-center gap-2 text-gray-800"><Factory className="h-6 w-6 text-purple-600" />Production Management</CardTitle>

          <CardDescription className="text-gray-700">Log production details for ready job cards.</CardDescription>

        </CardHeader>

        <CardContent className="p-2 sm:p-4 lg:p-6">

          <Tabs value={activeTab} onValueChange={setActiveTab}>

            <TabsList className="grid w-full sm:w-auto md:w-[450px] grid-cols-2 mb-4 self-start">

              <TabsTrigger value="pending" className="flex items-center gap-2"><Factory className="h-4 w-4" /> Pending<Badge variant="secondary" className="ml-1.5">{pendingProductions.length}</Badge></TabsTrigger>

              <TabsTrigger value="history" className="flex items-center gap-2"><History className="h-4 w-4" /> History<Badge variant="secondary" className="ml-1.5">{historyProductions.length}</Badge></TabsTrigger>

            </TabsList>

            

            <TabsContent value="pending" className="mt-0">

                <Card className="shadow-sm border-border">

                    <CardHeader className="py-2 px-3 bg-muted/30 flex-row items-center justify-between">

                        <CardTitle className="text-base font-semibold">Pending Items</CardTitle>

                        <ColumnToggler tab="pending" columnsMeta={PENDING_COLUMNS_META} />

                    </CardHeader>

                    <CardContent className="p-0">

                        <div className="overflow-x-auto">

                            <Table>

                                <TableHeader><TableRow>{visiblePendingColumnsMeta.map((col) => (<TableHead key={col.dataKey}>{col.header}</TableHead>))}</TableRow></TableHeader>

                                <TableBody>

                                    {pendingProductions.length > 0 ? pendingProductions.map((jobCard) => (

                                        <TableRow key={jobCard._rowIndex}>

                                            {visiblePendingColumnsMeta.map((col) => (

                                                <TableCell key={col.dataKey} className="whitespace-nowrap text-sm py-2 px-3">

                                                    {col.dataKey === "actionColumn" ? (<Button size="sm" onClick={() => handleOpenDialog(jobCard)} className="bg-purple-600 text-white hover:bg-purple-700"><Factory className="mr-2 h-4 w-4" />Log</Button>) : (jobCard[col.dataKey as keyof ProductionItem] || "-")}

                                                </TableCell>

                                            ))}

                                        </TableRow>

                                    )) : <TableRow><TableCell colSpan={visiblePendingColumnsMeta.length} className="h-24 text-center">No pending items found.</TableCell></TableRow>}

                                </TableBody>

                            </Table>

                        </div>

                    </CardContent>

                </Card>

            </TabsContent>

            

            <TabsContent value="history" className="mt-0">

                <Card className="shadow-sm border-border">

                    <CardHeader className="py-2 px-3 bg-muted/30 flex-row items-center justify-between">

                        <CardTitle className="text-base font-semibold">Production History</CardTitle>

                        <ColumnToggler tab="history" columnsMeta={HISTORY_COLUMNS_META} />

                    </CardHeader>

                    <CardContent className="p-0">

                        <div className="overflow-x-auto">

                            <Table>

                                <TableHeader><TableRow>{visibleHistoryColumnsMeta.map((col) => (<TableHead key={col.dataKey}>{col.header}</TableHead>))}</TableRow></TableHeader>

                                <TableBody>

                                    {historyProductions.length > 0 ? historyProductions.map((item) => (

                                        <TableRow key={item._rowIndex}>

                                            {visibleHistoryColumnsMeta.map((col) => (

                                                <TableCell key={col.dataKey} className="whitespace-nowrap text-sm py-2 px-3">

                                                    {col.dataKey === 'rawMaterials' ? renderRawMaterials(item.rawMaterials) : (item[col.dataKey as keyof HistoryItem] || "-")}

                                                </TableCell>

                                            ))}

                                        </TableRow>

                                    )) : <TableRow><TableCell colSpan={visibleHistoryColumnsMeta.length} className="h-24 text-center">No history found.</TableCell></TableRow>}

                                </TableBody>

                            </Table>

                        </div>

                    </CardContent>

                </Card>

            </TabsContent>


          </Tabs>

        </CardContent>

      </Card>


      <Dialog open={!!viewingMaterials} onOpenChange={(isOpen) => !isOpen && setViewingMaterials(null)}>

        <DialogContent>

            <DialogHeader>

                <DialogTitle>Raw Materials Used</DialogTitle>

                <DialogDescription>Full list of materials and quantities used for this production run.</DialogDescription>

            </DialogHeader>

            <div className="mt-4 max-h-80 overflow-y-auto">

                <Table>

                    <TableHeader>

                        <TableRow>

                            <TableHead>Material Name</TableHead>

                            <TableHead className="text-right">Quantity</TableHead>

                        </TableRow>

                    </TableHeader>

                    <TableBody>

                        {viewingMaterials?.map((material, index) => (

                            <TableRow key={index}>

                                <TableCell>{material.name}</TableCell>

                                <TableCell className="text-right">{material.quantity}</TableCell>

                            </TableRow>

                        ))}

                    </TableBody>

                </Table>

            </div>

        </DialogContent>

      </Dialog>

      

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>

        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">

          <DialogHeader><DialogTitle>Log Production for JC: {selectedJobCard?.jobCardNo}</DialogTitle><DialogDescription>Enter the final production details. Fields with * are required.</DialogDescription></DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6 p-1">

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 border rounded-lg bg-muted/50">

              <div><Label>DO No.</Label><p className="text-sm font-semibold">{selectedJobCard?.deliveryOrderNo}</p></div><div><Label>Party Name</Label><p className="text-sm">{selectedJobCard?.partyName}</p></div><div><Label>Product</Label><p className="text-sm">{selectedJobCard?.productName}</p></div><div><Label>Supervisor</Label><p className="text-sm">{selectedJobCard?.supervisorName}</p></div>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <div><Label htmlFor="quantityFG">Quantity Of FG *</Label><Input id="quantityFG" type="number" value={formData.quantityFG} onChange={(e) => setFormData({ ...formData, quantityFG: e.target.value })} className={formErrors.quantityFG ? "border-red-500" : ""} />{formErrors.quantityFG && <p className="text-xs text-red-600 mt-1">{formErrors.quantityFG}</p>}</div>

              <div><Label htmlFor="machineRunningHour">Machine Running Hour (HH:MM:SS) *</Label><Input id="machineRunningHour" type="text" placeholder="e.g., 08:30:00" value={formData.machineRunningHour} onChange={(e) => setFormData({ ...formData, machineRunningHour: e.target.value })} className={formErrors.machineRunningHour ? "border-red-500" : ""} />{formErrors.machineRunningHour && (<p className="text-xs text-red-600 mt-1">{formErrors.machineRunningHour}</p>)}</div>

            </div>

            <div className="space-y-4">

              <Label className="font-medium">Raw Materials Used * <span className="text-sm text-muted-foreground">({formData.rawMaterials.length} of 20)</span></Label>

              <div className="flex items-end gap-2">

                <div className="flex-1 space-y-1"><Label htmlFor="mat-name" className="text-xs">Material Name</Label><Select value={newMaterial.name} onValueChange={(value) => setNewMaterial({ ...newMaterial, name: value })}><SelectTrigger id="mat-name"><SelectValue placeholder="Select a material..." /></SelectTrigger><SelectContent>{materialsList.map((material) => (<SelectItem key={material} value={material}>{material}</SelectItem>))}</SelectContent></Select></div>

                <div className="w-32 space-y-1"><Label htmlFor="mat-qty" className="text-xs">Quantity</Label><Input id="mat-qty" type="number" placeholder="e.g., 500" value={newMaterial.quantity} onChange={(e) => setNewMaterial({ ...newMaterial, quantity: e.target.value })} /></div>

                <Button type="button" onClick={handleAddMaterial} disabled={!newMaterial.name || !newMaterial.quantity || formData.rawMaterials.length >= 20} className="bg-purple-600 text-white hover:bg-purple-700"><Plus className="h-4 w-4 mr-1" />Add</Button>

              </div>

              {formErrors.rawMaterials && <p className="text-xs text-red-600 mt-1">{formErrors.rawMaterials}</p>}

              {formData.rawMaterials.length > 0 && (<div className="border rounded-md p-2 space-y-2 max-h-40 overflow-y-auto">{formData.rawMaterials.map((material, index) => (<div key={index} className="flex items-center justify-between bg-muted p-2 rounded-md text-sm"><span>{index + 1}. {material.name}</span><div className="flex items-center gap-4"><span>{material.quantity}</span><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleRemoveMaterial(index)}><X className="h-4 w-4" /></Button></div></div>))}</div>)}

            </div>

            <div className="flex justify-end gap-2 pt-4 border-t"><Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancel</Button><Button type="submit" disabled={isSubmitting} className="bg-purple-600 text-white hover:bg-purple-700">{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Production</Button></div>

          </form>

        </DialogContent>

      </Dialog>

    </div>

  )

}