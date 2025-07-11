"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2, AlertTriangle, FileText, History } from "lucide-react"
import { format } from "date-fns"
// Shadcn UI components
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

// --- Configuration ---
const WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbwpDkP_Wmk8udmH6XsWPvpXgj-e3rGNxNJlOdAVXEWiCJWh3LI8CjIH4oJW5k5pjKFCvg/exec"
const SHEET_ID = "1niKq7rnnWdkH5gWXJIiVJQEsUKgK8qdjLokbo0rmt48"
const ACTUAL_PRODUCTION_SHEET = "Actual Production"
const JOBCARDS_SHEET = "JobCards" // Corrected to use the JobCards sheet

// --- Column Mapping for Tally Data ---
const TALLY_COLUMNS = {
  tallyTimestamp: 64, // Column BL (index 63, but 1-based = 64)
  remarks: 66, // Column BN (index 65, but 1-based = 66)
}

// --- Type Definitions ---
interface PendingTallyItem {
  jobCardNo: string
  deliveryOrderNo: string
  productName: string
  quantity: number
  checkStatus: string
  checkTimestamp: string
}

interface HistoryTallyItem {
  jobCardNo: string
  deliveryOrderNo: string
  productName: string
  quantity: number
  tallyTimestamp: string
  remarks: string
}

interface GvizRow {
  c: ({ v: any; f?: string } | null)[]
}

// Helper function to parse Google's date format
function parseGvizDate(gvizDateString: string | null | undefined): Date | null {
  if (!gvizDateString || typeof gvizDateString !== "string" || !gvizDateString.startsWith("Date(")) return null
  const numbers = gvizDateString.match(/\d+/g)
  if (!numbers || numbers.length < 3) return null
  const [year, month, day, hours = 0, minutes = 0, seconds = 0] = numbers.map(Number)
  const date = new Date(year, month, day, hours, minutes, seconds)
  return isNaN(date.getTime()) ? null : date
}

export default function TallyPage() {
  const [pendingTallies, setPendingTallies] = useState<PendingTallyItem[]>([])
  const [historyTallies, setHistoryTallies] = useState<HistoryTallyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedTally, setSelectedTally] = useState<PendingTallyItem | null>(null)
  const [remarks, setRemarks] = useState("")

  const fetchDataWithGviz = useCallback(async (sheetName: string) => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(
      sheetName,
    )}&cb=${new Date().getTime()}`
    try {
      const response = await fetch(url, { cache: "no-store" })
      if (!response.ok) throw new Error(`Network response was not ok for ${sheetName}.`)
      const text = await response.text()
      const jsonText = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1)
      const data = JSON.parse(jsonText)
      if (!data.table) throw new Error(`Invalid data structure from ${sheetName}.`)
      return data.table
    } catch (err) {
      console.error(`Failed to fetch or parse ${sheetName}:`, err)
      throw err
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [actualProductionTable, jobCardsTable] = await Promise.all([
        fetchDataWithGviz(ACTUAL_PRODUCTION_SHEET),
        fetchDataWithGviz(JOBCARDS_SHEET).catch(() => ({ rows: [] })),
      ]);

      const processGvizTable = (table: any) => {
        if (!table || !table.rows || table.rows.length === 0) return [];
        return table.rows
          .slice(1) // Skip header row
          .map((row: GvizRow) => {
            if (!row || !row.c) return null;
            const rowData: { [key: string]: any } = {};
            row.c.forEach((cell, cellIndex) => {
              rowData[`col${cellIndex}`] = cell ? cell.v : null;
            });
            return rowData;
          })
          .filter(Boolean);
      };

      const actualProductionRows = processGvizTable(actualProductionTable);
      const jobCardsRows = processGvizTable(jobCardsTable);

      // Create a lookup Map from the JobCards sheet for fast joining
      const jobCardsMap = new Map();
      jobCardsRows.forEach((row) => {
        // --- THIS IS THE CORRECTED LINE ---
        // Key is now Job Card Number (Column B), normalized
        const jobCardNo = String(row.col1 || "").trim().toUpperCase(); // Corrected from col2 to col1

        if (jobCardNo) {
          jobCardsMap.set(jobCardNo, {
            deliveryOrderNo: String(row.col4 || ""), // Column E
            productName: String(row.col6 || "N/A"), // Column G
            quantity: Number(row.col7 || 0),        // Column H
          });
        }
      });

      // Map over all items from Actual Production and join with JobCard data
      const allItems = actualProductionRows.map((row) => {
        const jobCardKey = String(row.col1 || "").trim().toUpperCase();
        const jobCardInfo = jobCardsMap.get(jobCardKey) || { deliveryOrderNo: "N/A", productName: "N/A", quantity: 0 };
        
        return {
          jobCardNo: String(row.col1 || ""),
          deliveryOrderNo: jobCardInfo.deliveryOrderNo,
          productName: jobCardInfo.productName,
          quantity: jobCardInfo.quantity,
          checkStatus: String(row.col60 || "N/A"),
          checkTimestamp: row.col58 ? (parseGvizDate(row.col58) ? format(parseGvizDate(row.col58)!, "dd/MM/yy HH:mm") : String(row.col58)) : "N/A",
          tallyTimestamp: row.col63 ? (parseGvizDate(row.col63) ? format(parseGvizDate(row.col63)!, "dd/MM/yy HH:mm") : String(row.col63)) : null,
          remarks: String(row.col65 || ""),
          _rawCheckTimestamp: row.col62,
          _rawTallyTimestamp: row.col63,
        };
      });

      // Filtering logic
      const pendingData = allItems.filter(item => item._rawCheckTimestamp && (item._rawTallyTimestamp === null || String(item._rawTallyTimestamp).trim() === ""));
      setPendingTallies(pendingData);

      const historyData = allItems.filter(item => item._rawTallyTimestamp && String(item._rawTallyTimestamp).trim() !== "").sort((a, b) => new Date(b.tallyTimestamp!).getTime() - new Date(a.tallyTimestamp!).getTime());
      setHistoryTallies(historyData);

    } catch (err: any) {
      setError(`Failed to load data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [fetchDataWithGviz]);

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleVerify = (tally: PendingTallyItem) => {
    setSelectedTally(tally)
    setRemarks("")
    setIsDialogOpen(true)
  }

  const handleSaveTally = async () => {
    if (!selectedTally) return
    setIsSubmitting(true)
    try {
      const timestamp = format(new Date(), "dd/MM/yyyy HH:mm:ss")
      const columnUpdates = {
        [TALLY_COLUMNS.tallyTimestamp]: timestamp,
        [TALLY_COLUMNS.remarks]: remarks,
      }

      const body = new URLSearchParams({
        sheetName: ACTUAL_PRODUCTION_SHEET,
        action: "updateByJobCard",
        jobCardNo: selectedTally.jobCardNo.trim().toUpperCase(),
        columnUpdates: JSON.stringify(columnUpdates),
      })

      const res = await fetch(WEB_APP_URL, {
        method: "POST",
        body: body,
      })
      const result = await res.json()

      if (!result.success) {
        throw new Error(result.error || "Failed to update tally data in Actual Production sheet.")
      }

      alert("Tally verification completed successfully!")
      setIsDialogOpen(false)
      await loadData()
    } catch (err: any) {
      setError(err.message)
      alert(`Error: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- UI Rendering ---
  const pendingTableColumns = [
    {
      header: "Action",
      key: "actionColumn",
      render: (tally: PendingTallyItem) => (
        <Button size="sm" onClick={() => handleVerify(tally)} className="bg-purple-600 text-white hover:bg-purple-700">
          <FileText className="mr-2 h-4 w-4" />
          Verify Tally
        </Button>
      ),
    },
    {
      header: "Job Card No.",
      key: "jobCardNo",
      render: (tally: PendingTallyItem) => <span className="font-medium">{tally.jobCardNo}</span>,
    },
    {
      header: "Delivery Order No.",
      key: "deliveryOrderNo",
      render: (tally: PendingTallyItem) => tally.deliveryOrderNo,
    },
    { header: "Product Name", key: "productName", render: (tally: PendingTallyItem) => tally.productName },
    { header: "Quantity", key: "quantity", render: (tally: PendingTallyItem) => tally.quantity },
    {
      header: "Check Status",
      key: "checkStatus",
      render: (tally: PendingTallyItem) => <Badge variant="default">{tally.checkStatus}</Badge>,
    },
    { header: "Check Date", key: "checkTimestamp", render: (tally: PendingTallyItem) => tally.checkTimestamp },
  ]

  const historyTableColumns = [
    {
      header: "Job Card No.",
      key: "jobCardNo",
      render: (tally: HistoryTallyItem) => <span className="font-medium">{tally.jobCardNo}</span>,
    },
    {
      header: "Delivery Order No.",
      key: "deliveryOrderNo",
      render: (tally: HistoryTallyItem) => tally.deliveryOrderNo,
    },
    { header: "Product Name", key: "productName", render: (tally: HistoryTallyItem) => tally.productName },
    { header: "Quantity", key: "quantity", render: (tally: HistoryTallyItem) => tally.quantity },
    { header: "Tally Date", key: "tallyTimestamp", render: (tally: HistoryTallyItem) => tally.tallyTimestamp },
    {
      header: "Remarks",
      key: "remarks",
      render: (tally: HistoryTallyItem) => (
        <span className="max-w-xs truncate" title={tally.remarks}>
          {tally.remarks || "-"}
        </span>
      ),
    },
  ]

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-purple-600" />
        <p className="ml-4 text-lg">Loading Tally Data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-600 bg-red-50 rounded-md">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
        <p className="text-lg font-semibold">Error Loading Data</p>
        <p className="text-sm">{error}</p>
        <Button onClick={loadData} className="mt-4">
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6 bg-white min-h-screen">
      <Card className="shadow-md border-none">
        <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-t-lg">
          <CardTitle className="flex items-center gap-2 text-gray-800">
            <FileText className="h-6 w-6 text-purple-600" />
            Tally Management
          </CardTitle>
          <CardDescription className="text-gray-700">
            Manage and verify production tallies for completed items.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full sm:w-[450px] grid-cols-2 mb-6">
              <TabsTrigger value="pending" className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> Pending Tallies
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0.5 text-xs">
                  {pendingTallies.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" /> Tally History
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0.5 text-xs">
                  {historyTallies.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              <Card className="shadow-sm border border-border">
                <CardHeader className="py-3 px-4 bg-purple-50 rounded-md p-2">
                  <CardTitle className="text-md font-semibold text-foreground">
                    Pending Tallies ({pendingTallies.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          {pendingTableColumns.map((col) => (
                            <TableHead key={col.key}>{col.header}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingTallies.length > 0 ? (
                          pendingTallies.map((tally, index) => (
                            <TableRow key={`${tally.jobCardNo}-${index}`} className="hover:bg-purple-50/50">
                              {pendingTableColumns.map((col) => (
                                <TableCell key={col.key}>{col.render(tally)}</TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={pendingTableColumns.length} className="h-48">
                              <div className="flex flex-col items-center justify-center text-center">
                                <FileText className="h-12 w-12 text-purple-500 mb-3" />
                                <p className="font-medium text-foreground">No Pending Tallies</p>
                                <p className="text-sm text-muted-foreground">
                                  All production tallies have been verified.
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card className="shadow-sm border border-border">
                <CardHeader className="py-3 px-4 bg-purple-50 rounded-md p-2">
                  <CardTitle className="text-md font-semibold text-foreground">
                    Tally History ({historyTallies.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          {historyTableColumns.map((col) => (
                            <TableHead key={col.key}>{col.header}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyTallies.length > 0 ? (
                          historyTallies.map((tally, index) => (
                            <TableRow key={`${tally.jobCardNo}-${index}`} className="hover:bg-purple-50/50">
                              {historyTableColumns.map((col) => (
                                <TableCell key={col.key}>{col.render(tally)}</TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={historyTableColumns.length} className="h-48">
                              <div className="flex flex-col items-center justify-center text-center">
                                <History className="h-12 w-12 text-purple-500 mb-3" />
                                <p className="font-medium text-foreground">No Tally History</p>
                                <p className="text-sm text-muted-foreground">
                                  Completed tally records will appear here.
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Verify Tally for JC: {selectedTally?.jobCardNo}</DialogTitle>
            <DialogDescription>
              Review the production details and add any remarks for the tally verification.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSaveTally()
            }}
            className="space-y-6 pt-4"
          >
            <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/50">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Job Card No.</Label>
                <p className="text-sm font-semibold">{selectedTally?.jobCardNo}</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Delivery Order No.</Label>
                <p className="text-sm font-semibold">{selectedTally?.deliveryOrderNo}</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Product Name</Label>
                <p className="text-sm font-semibold">{selectedTally?.productName}</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Check Status</Label>
                <p className="text-sm font-semibold">{selectedTally?.checkStatus}</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Quantity</Label>
                <p className="text-sm font-semibold">{selectedTally?.quantity}</p>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Check Date</Label>
                <p className="text-sm font-semibold">{selectedTally?.checkTimestamp}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea
                id="remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Enter any remarks or observations about the tally verification..."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-purple-600 text-white hover:bg-purple-700">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Complete Tally Verification
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}