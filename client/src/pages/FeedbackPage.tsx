import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const QUESTIONS = [
    "Q1. Briefly describe the kind of writing you do. Tell us about the scale and nature of your projects.",
    "Q2. What tools or systems were you using to manage your writing projects before trying Story Vault?",
    "Q3. When you first opened Story Vault, how did you figure out what to do? Was there a moment of confusion?",
    "Q4. Is there anything your previous tool did that Story Vault currently does not?",
    "Q5. Describe your overall experience using Story Vault in your own words. Did it feel natural or forced?",
    "Q6. What is the single most important reason you feel that way?",
    "Q7. Which feature did you find most valuable, and why did it matter to you specifically?",
    "Q8. Which feature frustrated you the most, or felt the least useful?",
    "Q9. Go through each major area of Story Vault and tell us briefly how it felt: Scene Manager, Writing Studio, Version Control, Smart Mentions, Character Profiles, World-Building Notes, Export Suite, SVP Export/Import.",
    "Q10. Was there a moment during your use of Story Vault where you wanted to do something and couldn't?",
    "Q11. The Writing Studio is designed to be a distraction-free environment. Did it feel that way to you?",
    "Q12. If your project was large enough to test this, how did it hold up at scale?",
    "Q13. What is the one thing Story Vault is missing that would make it genuinely indispensable to your workflow?",
    "Q14. Is there anything in Story Vault you would remove entirely?",
    "Q15. Did you find yourself wanting to share your project with someone else?",
    "Q16. How do you feel about storing your writing and world-building notes in a cloud-based tool?",
    "Q17. Do you see Story Vault as something you would want to use regularly for your work?",
    "Q18. Story Vault is considering a monthly subscription model ($8, $15, $25). Tell us how it feels and what the right price actually is.",
    "Q19. Is there anything about your experience that none of the previous questions gave you space to say?"
];

export default function FeedbackPage() {
  const [category, setCategory] = useState<"bug" | "feature" | "ux" | "pricing" | "other">("other");
  const [responses, setResponses] = useState<Record<string, string>>({});

  const submitMutation = trpc.feedback.submit.useMutation({
    onSuccess: () => {
      toast.success("Feedback submitted. Thank you!");
      setResponses({});
    },
    onError: (err) => toast.error(`Failed to submit: ${err.message}`),
  });

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Beta Feedback</h1>
      <p className="text-muted-foreground">Thank you for helping us improve Story Vault. Your insights are invaluable.</p>
      
      <div className="space-y-4">
        <Label>Category</Label>
        <Select value={category} onValueChange={(c: any) => setCategory(c)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="feature">Feature Request</SelectItem>
                <SelectItem value="ux">UX Feedback</SelectItem>
                <SelectItem value="pricing">Pricing</SelectItem>
                <SelectItem value="other">Other</SelectItem>
            </SelectContent>
        </Select>
        
        {QUESTIONS.map((q, i) => (
            <div key={i} className="space-y-1">
                <Label className="text-sm font-medium">{q}</Label>
                <Textarea value={responses[i] || ""} onChange={e => setResponses({...responses, [i]: e.target.value})} rows={3} />
            </div>
        ))}
        <Button onClick={() => submitMutation.mutate({ category, responses })} disabled={submitMutation.isPending}>Submit Survey</Button>
      </div>
    </div>
  );
}
