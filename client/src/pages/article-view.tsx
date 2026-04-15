import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, User, Tag, Building2 } from "lucide-react";
import { Helmet } from "react-helmet";
import ReactMarkdown from "react-markdown";

export default function ArticleView() {
  const [, params] = useRoute("/article/:slug");
  const slug = params?.slug;

  const { data: articleData, isLoading } = useQuery<{ success: boolean; data: any }>({
    queryKey: [`/api/articles/slug/${slug}`],
    enabled: !!slug,
  });

  const article = articleData?.data;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="h-8 w-64 bg-muted rounded mb-4 mx-auto" />
          <div className="h-4 w-48 bg-muted rounded mx-auto" />
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Article Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The article you're looking for doesn't exist or has been removed.
          </p>
          <Link href="/">
            <Button>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{article.title} | GEO Platform</title>
        <meta name="description" content={article.metaDescription || article.excerpt || article.title} />
        <meta name="keywords" content={article.keywords?.join(', ') || ''} />
        
        {/* Open Graph tags */}
        <meta property="og:title" content={article.title} />
        <meta property="og:description" content={article.metaDescription || article.excerpt || article.title} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={window.location.href} />
        {article.featuredImage && <meta property="og:image" content={article.featuredImage} />}
        
        {/* Twitter Card tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={article.title} />
        <meta name="twitter:description" content={article.metaDescription || article.excerpt || article.title} />
        {article.featuredImage && <meta name="twitter:image" content={article.featuredImage} />}
        
        {/* Canonical URL */}
        {article.canonicalUrl && <link rel="canonical" href={article.canonicalUrl} />}
      </Helmet>

      <div className="min-h-screen bg-background">
        <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </Link>
          </div>
        </header>

        <article className="max-w-4xl mx-auto px-6 py-12">
          <div className="mb-8">
            <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="article-title">
              {article.title}
            </h1>
            
            {article.excerpt && (
              <p className="text-xl text-muted-foreground mb-6" data-testid="article-excerpt">
                {article.excerpt}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {article.author && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span data-testid="article-author">{article.author}</span>
                </div>
              )}
              
              {article.publishedAt && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <time dateTime={article.publishedAt} data-testid="article-date">
                    {new Date(article.publishedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </time>
                </div>
              )}

              {article.industry && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  <span data-testid="article-industry">{article.industry}</span>
                </div>
              )}
            </div>

            {article.keywords && article.keywords.length > 0 && (
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <Tag className="h-4 w-4 text-muted-foreground" />
                {article.keywords.map((keyword: string, index: number) => (
                  <span
                    key={index}
                    className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium"
                    data-testid={`tag-${index}`}
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            )}
          </div>

          {article.featuredImage && (
            <div className="mb-8">
              <img
                src={article.featuredImage}
                alt={article.title}
                className="w-full rounded-lg shadow-lg"
                data-testid="article-featured-image"
              />
            </div>
          )}

          <Card>
            <CardContent className="prose prose-lg dark:prose-invert max-w-none pt-6">
              <ReactMarkdown data-testid="article-content">
                {article.content}
              </ReactMarkdown>
            </CardContent>
          </Card>

          {article.citations > 0 && (
            <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>AI Platform Citations:</strong> This article has been cited {article.citations} time{article.citations !== 1 ? 's' : ''} by AI platforms including ChatGPT, Claude, and Perplexity.
              </p>
            </div>
          )}
        </article>
      </div>
    </>
  );
}
