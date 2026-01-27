import { useState } from 'react';
import { ChevronDown, ChevronUp, Trash2, GripVertical, MapPin, Plus, X } from 'lucide-react';
import { ShippingZoneUI, ZONE_COLORS } from '@/types/shipping';
import { EditableCell } from './EditableCell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ZoneCardProps {
  zone: ShippingZoneUI;
  onUpdate: (zone: ShippingZoneUI) => void;
  onDelete: (zoneId: string) => void;
  gridData: any;
}

export function ZoneCard({ zone, onUpdate, onDelete, gridData }: ZoneCardProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingCountries, setIsEditingCountries] = useState(false);

  const toggleExpanded = () => {
    onUpdate({ ...zone, isExpanded: !zone.isExpanded });
  };

  const updateRate = (serviceIndex: number, rateIndex: number, value: number | null) => {
    const newServices = [...zone.services];
    newServices[serviceIndex] = {
      ...newServices[serviceIndex],
      rates: newServices[serviceIndex].rates.map((r, i) => (i === rateIndex ? value : r)),
    };
    onUpdate({ ...zone, services: newServices });
  };

  const addService = () => {
    const newService = {
      serviceName: 'NOUVEAU',
      serviceId: `temp-${Date.now()}`,
      rates: zone.weightBrackets.map(() => null),
    };
    onUpdate({ ...zone, services: [...zone.services, newService] });
  };

  const removeService = (serviceIndex: number) => {
    if (zone.services.length <= 1) return;
    const newServices = zone.services.filter((_, i) => i !== serviceIndex);
    onUpdate({ ...zone, services: newServices });
  };

  const updateServiceName = (serviceIndex: number, name: string) => {
    const newServices = [...zone.services];
    newServices[serviceIndex] = { ...newServices[serviceIndex], serviceName: name };
    onUpdate({ ...zone, services: newServices });
  };

  const addWeightBracket = () => {
    const lastWeight = zone.weightBrackets[zone.weightBrackets.length - 1] || 0;
    const newWeight = lastWeight + 10;
    const newWeightBrackets = [...zone.weightBrackets, newWeight];
    const newServices = zone.services.map((s) => ({
      ...s,
      rates: [...s.rates, null],
    }));
    onUpdate({ ...zone, weightBrackets: newWeightBrackets, services: newServices });
  };

  const removeWeightBracket = (index: number) => {
    if (zone.weightBrackets.length <= 1) return;
    const newWeightBrackets = zone.weightBrackets.filter((_, i) => i !== index);
    const newServices = zone.services.map((s) => ({
      ...s,
      rates: s.rates.filter((_, i) => i !== index),
    }));
    onUpdate({ ...zone, weightBrackets: newWeightBrackets, services: newServices });
  };

  const updateWeightBracket = (index: number, value: number) => {
    const newWeightBrackets = [...zone.weightBrackets];
    newWeightBrackets[index] = value;
    onUpdate({ ...zone, weightBrackets: newWeightBrackets });
  };

  const zoneColorClass = ZONE_COLORS[zone.code] || 'bg-primary/10 text-primary border-primary/20';

  return (
    <div className="bg-card rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border border-border overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={toggleExpanded}
      >
        <div className="text-muted-foreground/40 cursor-grab">
          <GripVertical className="w-5 h-5" />
        </div>
        
        <div className={cn('px-3 py-1 rounded-full text-sm font-semibold border', zoneColorClass)}>
          Zone {zone.code}
        </div>

        <div className="flex-1 min-w-0">
          {isEditingName ? (
            <Input
              value={zone.name}
              onChange={(e) => onUpdate({ ...zone, name: e.target.value })}
              onBlur={() => setIsEditingName(false)}
              onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
              onClick={(e) => e.stopPropagation()}
              className="h-8 font-semibold"
              autoFocus
            />
          ) : (
            <h3
              className="font-semibold text-card-foreground truncate hover:text-primary transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingName(true);
              }}
            >
              {zone.name}
            </h3>
          )}
          
          <div className="flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3 text-muted-foreground" />
            {isEditingCountries ? (
              <Input
                value={zone.countries}
                onChange={(e) => onUpdate({ ...zone, countries: e.target.value })}
                onBlur={() => setIsEditingCountries(false)}
                onKeyDown={(e) => e.key === 'Enter' && setIsEditingCountries(false)}
                onClick={(e) => e.stopPropagation()}
                className="h-6 text-xs"
                autoFocus
              />
            ) : (
              <span
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingCountries(true);
                }}
              >
                {zone.countries}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(zone.id);
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          
          {zone.isExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {zone.isExpanded && (
        <div className="p-4 pt-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Service / Poids (kg)
                  </th>
                  {zone.weightBrackets.map((weight, index) => (
                    <th key={index} className="p-1 text-center min-w-[70px]">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          value={weight}
                          onChange={(e) => updateWeightBracket(index, parseFloat(e.target.value) || 0)}
                          className="w-12 text-center text-xs font-semibold bg-secondary rounded px-1 py-1"
                        />
                        <button
                          onClick={() => removeWeightBracket(index)}
                          className="text-muted-foreground/50 hover:text-destructive transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </th>
                  ))}
                  <th className="p-1 w-10">
                    <button
                      onClick={addWeightBracket}
                      className="p-1 text-muted-foreground hover:text-primary transition-colors rounded hover:bg-accent"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {zone.services.map((service, serviceIndex) => (
                  <tr key={serviceIndex} className="border-t border-border/50">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={service.serviceName}
                          onChange={(e) => updateServiceName(serviceIndex, e.target.value)}
                          className="font-medium text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-1 py-0.5 transition-colors"
                        />
                        {zone.services.length > 1 && (
                          <button
                            onClick={() => removeService(serviceIndex)}
                            className="text-muted-foreground/50 hover:text-destructive transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                    {service.rates.map((rate, rateIndex) => (
                      <td key={rateIndex} className="p-1">
                        <EditableCell
                          value={rate}
                          onChange={(value) => updateRate(serviceIndex, rateIndex, value)}
                        />
                      </td>
                    ))}
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={addService}
            className="mt-3 text-muted-foreground hover:text-primary"
          >
            <Plus className="w-4 h-4 mr-1" />
            Ajouter un service
          </Button>
        </div>
      )}
    </div>
  );
}

