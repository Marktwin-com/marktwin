import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Star, Users, Building, Sparkles } from "lucide-react";
import { Link } from "wouter";

export default function PricingPage() {
  const plans = [
    {
      name: "Free",
      price: "$0",
      period: "month",
      description: "Perfect for personal notes and testing Marktwin",
      icon: <Sparkles className="h-6 w-6" />,
      color: "text-primary",
      bgColor: "bg-card",
      borderColor: "border-border",
      features: [
        "1 Cabinet (1 GitHub repo)",
        "No collaboration",
        "Manual syncing",
        "Basic markdown editing",
        "Personal use only"
      ],
      buttonText: "Sign Up for Free",
      buttonVariant: "outline" as const,
      popular: false
    },
    {
      name: "Pro",
      price: "$5",
      period: "month",
      description: "Great for freelancers, small teams, and creators",
      icon: <Star className="h-6 w-6" />,
      color: "text-primary",
      bgColor: "bg-card",
      borderColor: "border-primary",
      features: [
        "Unlimited Cabinets (unlimited GitHub repos)",
        "Real-time collaboration & sharing",
        "Faster syncing",
        "Access control (share notes, read/write)",
        "Advanced branch management",
        "Merge conflict resolution",
        "Priority support"
      ],
      buttonText: "Upgrade to Pro",
      buttonVariant: "default" as const,
      popular: true
    },
    {
      name: "Team",
      price: "Coming Soon",
      period: "",
      description: "Enterprise features for larger organizations",
      icon: <Building className="h-6 w-6" />,
      color: "text-muted-foreground",
      bgColor: "bg-card",
      borderColor: "border-border",
      features: [
        "Everything in Pro",
        "Advanced user management",
        "SSO integration",
        "Custom branding",
        "Dedicated support",
        "SLA guarantees"
      ],
      buttonText: "Contact Us",
      buttonVariant: "outline" as const,
      popular: false
    }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="container mx-auto px-4 pt-16 pb-8">
        <div className="text-center max-w-4xl mx-auto">
          <Link href="/">
            <Button variant="ghost" className="mb-6">
              ← Back to Home
            </Button>
          </Link>

          <h1 className="text-5xl font-bold bg-gradient-to-r from-accent to-pink-600 bg-clip-text text-transparent mb-6">
            Pricing
          </h1>

          <p className="text-xl text-gray-300 mb-4">
            Welcome to <strong>Marktwin</strong> – the elegant, collaborative markdown note-taking app.
          </p>

          <p className="text-lg text-gray-400">
            Choose the perfect plan for your workflow:
          </p>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <Card
              key={plan.name}
              className={`relative transition-all duration-300 hover:shadow-xl ${plan.borderColor} ${plan.bgColor} ${plan.popular ? 'ring-2 ring-accent scale-105' : ''}`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-accent text-accent-foreground">
                  Most Popular
                </Badge>
              )}

              <CardHeader className="text-center pb-4">
                <div className={`w-12 h-12 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center ${plan.color}`}>
                  {plan.icon}
                </div>

                <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>

                <div className="mt-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  {plan.period && <span className="text-gray-400 ml-1">/ {plan.period}</span>}
                </div>

                <p className="text-sm text-gray-400 mt-2">
                  {plan.description}
                </p>
              </CardHeader>

              <CardContent className="space-y-6">
                <ul className="space-y-3">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={plan.buttonVariant}
                  className={`w-full ${plan.buttonVariant === "default"
                    ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                    : "bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
                    }`}
                  size="lg"
                >
                  {plan.buttonText}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Why Choose Marktwin */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-8">💡 Why Choose Marktwin?</h2>

          <p className="text-lg text-gray-300 mb-8">
            Marktwin is crafted to help you <strong>write together, effortlessly</strong>:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="text-left">
              <h3 className="font-semibold mb-2">🎨 Minimalist & elegant</h3>
              <p className="text-gray-400">No clutter, just focused note-taking</p>
            </div>

            <div className="text-left">
              <h3 className="font-semibold mb-2">⚡ Real-time</h3>
              <p className="text-gray-400">Instantly see edits and comments</p>
            </div>

            <div className="text-left">
              <h3 className="font-semibold mb-2">🔒 Secure</h3>
              <p className="text-gray-400">Your data stays yours, with GitHub integration</p>
            </div>

            <div className="text-left">
              <h3 className="font-semibold mb-2">🤝 Collaborative</h3>
              <p className="text-gray-400">Built for teams and individual creators</p>
            </div>
          </div>

          <p className="text-xl font-medium text-primary">
            Craft, together.
          </p>
        </div>
      </div>

      {/* CTA Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-8">🎯 Ready to start?</h2>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Button variant="outline" size="lg" className="text-lg px-8">
              Sign Up for Free
            </Button>
            <Button size="lg" className="text-lg px-8">
              Upgrade to Pro
            </Button>
          </div>

          <p className="text-xl font-medium text-primary">
            Craft, together.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-muted-foreground">
            <p>&copy; 2025 Marktwin. All rights reserved.</p>
            <p className="mt-2">
              <Link href="/">
                <Button variant="link" className="p-0 h-auto">
                  Back to Home
                </Button>
              </Link>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}