import { ReflectionForm } from "@/components/reflection-form";

export default function CheckIn() {
  return <>
    <p className="eyebrow">01 / Reflect</p>
    <h1>Daily Check-in</h1>
    <p className="intro">What stood out in class, a lab, a project, or an event today?</p>
    <ReflectionForm />
  </>;
}