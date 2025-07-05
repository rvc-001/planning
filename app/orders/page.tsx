"use client"

import React, { useState, useEffect } from "react"
import { Calendar as CalendarIcon, Loader2, FileText } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export default function OrdersPage() {
  const [date, setDate] = useState<Date | undefined>()
  const [showCalendar, setShowCalendar] = useState(false)
  const [priority, setPriority] = useState("")
  const [priorityOptions] = useState(["Normal", "High", "Urgent"])
  const [loading, setLoading] = useState(false)
  
  // Central state to hold all order data from the sheet
  const [allOrdersData, setAllOrdersData] = useState<any[]>([])
  
  // State for dropdown options
  const [firmOptions, setFirmOptions] = useState<string[]>([])
  const [orderNoOptions, setOrderNoOptions] = useState<string[]>([])

  // State for form data
  const [formData, setFormData] = useState({
    firmName: "",
    deliveryOrderNo: "",
    partyName: "",
    productName: "",
    orderQuantity: "",
    note: "",
  })
  
  const [fetchingOptions, setFetchingOptions] = useState(true)

  const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwpDkP_Wmk8udmH6XsWPvpXgj-e3rGNxNJlOdAVXEWiCJWh3LI8CjIH4oJW5k5pjKFCvg/exec"
  const SHEET_ID = "1niKq7rnnWdkH5gWXJIiVJQEsUKgK8qdjLokbo0rmt48"
  
  useEffect(() => {
    const fetchOrdersData = async () => {
        const sheetName = "Orders" // Switched to Orders sheet
        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&headers=1`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch from ${sheetName}: ${response.statusText}`);
            
            const text = await response.text();
            const match = text.match(/google\.visualization\.Query\.setResponse\((.*)\)/);
            if (!match || !match[1]) throw new Error(`Invalid response from ${sheetName}`);
            
            const gvizResponse = JSON.parse(match[1]);
            const rows = gvizResponse.table.rows.map((row: any) => ({
                firmName: row.c[0]?.v,
                partyName: row.c[1]?.v,
                orderNo: row.c[2]?.v,
                productName: row.c[3]?.v,
            }));

            setAllOrdersData(rows);

            // Get unique firm names for the first dropdown
            const uniqueFirms = [...new Set(rows.map((row: any) => row.firmName).filter(Boolean))];
            setFirmOptions(uniqueFirms);

        } catch (error) {
            console.error("Failed to fetch dropdown options:", error);
            alert("Could not load order options. Please check the console and sheet configuration.");
        } finally {
            setFetchingOptions(false)
        }
    };

    fetchOrdersData();
  }, [SHEET_ID]);

  // Handle Firm Name selection
  const handleFirmChange = (selectedFirm: string) => {
    // Filter orders for the selected firm
    const filteredOrders = allOrdersData
        .filter(order => order.firmName === selectedFirm)
        .map(order => order.orderNo)
        .filter(Boolean);
    
    const uniqueOrderNos = [...new Set(filteredOrders)];
    setOrderNoOptions(uniqueOrderNos);

    // Update form state and reset dependent fields
    setFormData({
      ...formData,
      firmName: selectedFirm,
      deliveryOrderNo: "",
      partyName: "",
      productName: ""
    });
  };

  // Handle Order No. selection
  const handleOrderNoChange = (selectedOrderNo: string) => {
    // Find the full order details
    const selectedOrder = allOrdersData.find(order => 
      order.firmName === formData.firmName && order.orderNo === selectedOrderNo
    );

    // Auto-populate party and product name
    setFormData({
      ...formData,
      deliveryOrderNo: selectedOrderNo,
      partyName: selectedOrder?.partyName || "",
      productName: selectedOrder?.productName || "",
    });
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData(prev => ({ ...prev, [id]: value }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!formData.firmName.trim() || !formData.deliveryOrderNo.trim()) {
      alert("Please select a Firm Name and a Delivery Order No.")
      return
    }

    setLoading(true)

    try {
      const now = new Date();
      const pad = (num: number) => num.toString().padStart(2, '0');
      const formattedTimestamp = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const expectedDeliveryFormatted = date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` : ""

      const rowDataArray = [
        formattedTimestamp,
        formData.deliveryOrderNo.trim(),
        formData.firmName.trim(),
        formData.partyName.trim(),
        formData.productName.trim(),
        formData.orderQuantity.trim(),
        expectedDeliveryFormatted,
        priority,
        formData.note.trim(),
      ];

      const body = new URLSearchParams({
        sheetName: "Production",
        action: 'insert',
        rowData: JSON.stringify(rowDataArray)
      });

      const response = await fetch(WEB_APP_URL, {
        method: 'POST',
        body: body,
      });

      const result = await response.json();

      if (result.success) {
        alert("Order submitted successfully!")
        setFormData({ firmName: "", deliveryOrderNo: "", partyName: "", productName: "", orderQuantity: "", note: "" })
        setDate(undefined)
        setPriority("")
        setOrderNoOptions([]); // Reset order options
      } else {
        throw new Error(result.error || "An unknown error occurred during submission.");
      }
    } catch (error) {
      console.error("Error submitting order:", error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred."
      alert(`Order submission failed: ${errorMessage}`);
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

  const handleDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate)
    setShowCalendar(false)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (showCalendar && !target.closest('.calendar-container')) {
        setShowCalendar(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showCalendar])

  return (
    <div className="min-h-screen bg-white font-sans text-gray-800">
      <div className="container mx-auto px-4 py-12">
        <div className="mb-10 p-6 rounded-2xl bg-purple-50/60 flex items-center gap-5 max-w-4xl mx-auto">
            <div className="bg-white p-3 rounded-xl shadow-sm border border-purple-100">
                <FileText className="h-8 w-8 text-purple-600" />
            </div>
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Job Card Management</h1>
                <p className="text-md text-gray-500 mt-1">Create and manage job cards for production orders</p>
            </div>
        </div>

        <div className="bg-white shadow-2xl shadow-purple-200/50 rounded-2xl max-w-4xl mx-auto border border-purple-100">
          <div className="p-8 border-b border-purple-100">
            <h2 className="text-2xl font-semibold text-gray-900">Create a New Job Card</h2>
            <p className="text-sm text-gray-500 mt-1">Fields marked with <span className="text-purple-500 font-semibold">*</span> are required.</p>
          </div>
          <div className="p-8">
            <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <Label htmlFor="firmName" className="text-gray-700 font-medium">Firm Name <span className="text-purple-500">*</span></Label>
                        <Select value={formData.firmName} onValueChange={handleFirmChange} required disabled={fetchingOptions}>
                            <SelectTrigger id="firmName" className="mt-2 focus:ring-purple-500 focus:border-purple-500"><SelectValue placeholder={fetchingOptions ? "Loading firms..." : "Select a firm"} /></SelectTrigger>
                            <SelectContent>{firmOptions.map(option => (<SelectItem key={option} value={option}>{option}</SelectItem>))}</SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label htmlFor="deliveryOrderNo" className="text-gray-700 font-medium">Delivery Order No. <span className="text-purple-500">*</span></Label>
                        <Select value={formData.deliveryOrderNo} onValueChange={handleOrderNoChange} required disabled={!formData.firmName}>
                            <SelectTrigger id="deliveryOrderNo" className="mt-2 focus:ring-purple-500 focus:border-purple-500"><SelectValue placeholder={!formData.firmName ? "Select firm first" : "Select an order no."} /></SelectTrigger>
                            <SelectContent>{orderNoOptions.map(option => (<SelectItem key={option} value={option}>{option}</SelectItem>))}</SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <Label htmlFor="partyName" className="text-gray-700 font-medium">Party Name</Label>
                        <Input id="partyName" type="text" value={formData.partyName} placeholder="Auto-populated" readOnly className="mt-2 bg-gray-100 cursor-not-allowed" />
                    </div>
                    <div>
                        <Label htmlFor="productName" className="text-gray-700 font-medium">Product Name</Label>
                        <Input id="productName" type="text" value={formData.productName} placeholder="Auto-populated" readOnly className="mt-2 bg-gray-100 cursor-not-allowed" />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <Label htmlFor="orderQuantity" className="text-gray-700 font-medium">Order Quantity</Label>
                        <Input id="orderQuantity" type="number" min="1" value={formData.orderQuantity} onChange={handleInputChange} placeholder="e.g., 100" className="mt-2 focus:ring-purple-500 focus:border-purple-500" />
                    </div>
                    <div className="relative calendar-container">
                        <Label className="text-gray-700 font-medium">Expected Delivery Date</Label>
                        <Popover open={showCalendar} onOpenChange={setShowCalendar}>
                          <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal mt-2", !date && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4 text-purple-500" />
                                {date ? formatDate(date) : <span>Pick a date</span>}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 border-purple-200">
                            <Calendar mode="single" selected={date} onSelect={handleDateSelect} initialFocus />
                          </PopoverContent>
                        </Popover>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div>
                        <Label htmlFor="priority" className="text-gray-700 font-medium">Priority</Label>
                        <Select value={priority} onValueChange={setPriority}>
                            <SelectTrigger id="priority" className="mt-2 focus:ring-purple-500 focus:border-purple-500"><SelectValue placeholder="Set priority level" /></SelectTrigger>
                            <SelectContent>{priorityOptions.map((option, index) => (<SelectItem key={index} value={option}>{option}</SelectItem>))}</SelectContent>
                        </Select>
                    </div>
                </div>

                <div>
                    <Label htmlFor="note" className="text-gray-700 font-medium">Notes</Label>
                    <Textarea id="note" rows={4} value={formData.note} onChange={handleInputChange} placeholder="Add any special instructions for the production team..." className="mt-2 focus:ring-purple-500 focus:border-purple-500" />
                </div>

                <div className="pt-4 text-right">
                    <Button type="submit" disabled={loading} className={`inline-flex justify-center items-center px-8 py-3 border border-transparent text-base font-medium rounded-lg shadow-lg shadow-purple-500/50 text-white transition-all duration-300 transform hover:scale-105 ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500`}>
                        {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin"/>}
                        {loading ? "Submitting..." : "Create Job Card"}
                    </Button>
                </div>
            </form>
          </div>
        </div>
        <footer className="text-center mt-12">
            <p className="text-sm text-gray-400">&copy; {new Date().getFullYear()} Job Card Management. All rights reserved.</p>
        </footer>
      </div>
    </div>
  )
}