import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

// `form` is the react-hook-form instance. Typed as `any` on purpose so this
// component stays decoupled from brands.tsx's z.infer'd FormValues — the
// RHF invariant generics don't widen to UseFormReturn<any> cleanly.
interface Props {
  form: any;
  // Appended to data-testid values so create/edit can keep distinct ids
  // where they diverged historically (e.g. "input-website" vs "input-website-edit").
  idSuffix?: string;
}

export default function BrandFormFields({ form, idSuffix = "" }: Props) {
  const testid = (base: string) => `input-${base}${idSuffix}`;
  const selectTestid = (base: string) => `select-${base}${idSuffix}`;

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Brand Name *</FormLabel>
              <FormControl>
                <Input placeholder="Acme Inc" {...field} data-testid={testid("brand-name")} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="companyName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Company Name *</FormLabel>
              <FormControl>
                <Input
                  placeholder="Acme Corporation"
                  {...field}
                  data-testid={testid("company-name")}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="industry"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Industry *</FormLabel>
              <FormControl>
                <Input placeholder="Technology" {...field} data-testid={testid("industry")} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="website"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Website</FormLabel>
              <FormControl>
                <Input
                  placeholder="www.yourcompany.com"
                  {...field}
                  data-testid={testid("website")}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Brand Description</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Brief description of your brand..."
                {...field}
                data-testid={testid("description")}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="tone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Brand Tone</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger data-testid={selectTestid("tone")}>
                    <SelectValue placeholder="Select tone" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="conversational">Conversational</SelectItem>
                  <SelectItem value="authoritative">Authoritative</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="targetAudience"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Target Audience</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., B2B SaaS companies"
                  {...field}
                  data-testid={testid("target-audience")}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="products"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Products/Services</FormLabel>
            <FormControl>
              <Input
                placeholder="Comma-separated (e.g., Product A, Service B)"
                {...field}
                data-testid={testid("products")}
              />
            </FormControl>
            <FormDescription>
              List your main products or services, separated by commas
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="keyValues"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Key Values</FormLabel>
            <FormControl>
              <Input
                placeholder="Comma-separated (e.g., Innovation, Trust)"
                {...field}
                data-testid={testid("key-values")}
              />
            </FormControl>
            <FormDescription>Core values that define your brand</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="uniqueSellingPoints"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Unique Selling Points</FormLabel>
            <FormControl>
              <Input
                placeholder="Comma-separated (e.g., AI-powered, 24/7 support)"
                {...field}
                data-testid={testid("usp")}
              />
            </FormControl>
            <FormDescription>What makes your brand unique</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="brandVoice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Brand Voice Guidelines</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Describe your brand's voice and communication style..."
                {...field}
                data-testid={testid("brand-voice")}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="sampleContent"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Sample Content</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Paste example content that represents your brand..."
                {...field}
                data-testid={testid("sample-content")}
              />
            </FormControl>
            <FormDescription>
              Sample text that represents your brand's writing style
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="nameVariations"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name Variations (for GEO Tracking)</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g. Facebook, FB, the blue app"
                {...field}
                data-testid={testid("name-variations")}
              />
            </FormControl>
            <FormDescription>
              Comma-separated list of extra ways your brand gets referenced — former names (Facebook
              → Meta), nicknames, common misspellings. Legal suffixes ("Inc.", "LLC"), acronyms of
              3+ word company names, and your website domain are detected automatically; you don't
              need to list them here.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
