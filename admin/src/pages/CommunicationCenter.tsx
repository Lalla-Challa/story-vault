import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TableList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Send, 
  MessageCircle, 
  Mail, 
  Users, 
  History,
  Phone,
  MessageSquare
} from "lucide-react";

export default function CommunicationCenter() {
  const [recipientId, setRecipientId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<any>("email");
  
  const utils = trpc.useUtils();
  const { data: messages, isLoading } = trpc.admin.communication.history.useQuery();

  const sendMessage = trpc.admin.communication.send.useMutation({
    onSuccess: () => {
      toast.success("Message sent");
      utils.admin.communication.history.invalidate();
      setRecipientId("");
      setSubject("");
      setBody("");
    },
    onError: (err) => toast.error(err.message)
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#2D2926] font-[Literata]">Communication Center</h1>
        <p className="text-[#7e756f] mt-1 text-sm font-[Inter]">Reach out to beta testers across multiple channels.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
                <Send className="w-4 h-4" /> Dispatch Message
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-4 gap-2">
                <Button variant={channel === 'email' ? 'default' : 'outline'} size="sm" className="flex flex-col h-auto py-3 gap-1" onClick={() => setChannel('email')}>
                    <Mail className="w-4 h-4" /> <span className="text-[10px]">Email</span>
                </Button>
                <Button variant={channel === 'internal' ? 'default' : 'outline'} size="sm" className="flex flex-col h-auto py-3 gap-1" onClick={() => setChannel('internal')}>
                    <MessageSquare className="w-4 h-4" /> <span className="text-[10px]">Internal</span>
                </Button>
                <Button variant={channel === 'whatsapp' ? 'default' : 'outline'} size="sm" className="flex flex-col h-auto py-3 gap-1" onClick={() => setChannel('whatsapp')}>
                    <Phone className="w-4 h-4" /> <span className="text-[10px]">WhatsApp</span>
                </Button>
                <Button variant={channel === 'messenger' ? 'default' : 'outline'} size="sm" className="flex flex-col h-auto py-3 gap-1" onClick={() => setChannel('messenger')}>
                    <MessageCircle className="w-4 h-4" /> <span className="text-[10px]">Messenger</span>
                </Button>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>Recipient User ID</Label>
                    <Input placeholder="Enter userId or 'broadcast'" value={recipientId} onChange={(e) => setRecipientId(e.target.value)} />
                </div>
                {channel === 'email' && (
                  <div className="space-y-2">
                      <Label>Subject Line</Label>
                      <Input placeholder="Message subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                  </div>
                )}
                <div className="space-y-2">
                    <Label>Message Body</Label>
                    <Textarea 
                      placeholder="Compose your message here..." 
                      className="min-h-[150px]" 
                      value={body} 
                      onChange={(e) => setBody(e.target.value)} 
                    />
                </div>
                <Button className="w-full" disabled={!recipientId || !body} onClick={() => sendMessage.mutate({ 
                  recipientId: recipientId === 'broadcast' ? 0 : parseInt(recipientId),
                  channel,
                  subject,
                  body,
                  metadata: {}
                })}>
                    Send Dispatches
                </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
                <History className="w-4 h-4" /> Outbox History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
             <div className="max-h-[500px] overflow-y-auto">
                <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 z-10">
                        <TableRow>
                            <TableHead className="text-[10px] uppercase">Channel</TableHead>
                            <TableHead className="text-[10px] uppercase">Recipient</TableHead>
                            <TableHead className="text-[10px] uppercase">Date</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={3} className="text-center py-4">Loading history...</TableCell></TableRow>
                        ) : messages?.map((m) => (
                            <TableRow key={m.id} className="text-sm">
                                <TableCell className="capitalize">{m.channel}</TableCell>
                                <TableCell>{m.recipientId ? `User #${m.recipientId}` : 'Broadcast'}</TableCell>
                                <TableCell className="text-xs text-slate-500">
                                    {new Date(m.createdAt).toLocaleDateString()}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
