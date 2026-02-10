import { View, TextField, Button } from "reshaped";
import { Controller, type Control } from "react-hook-form";
import type { FormData } from "./types";

interface ChannelUrlFormProps {
  control: Control<FormData>;
  onSubmit: () => void;
  isLoading: boolean;
}

export default function ChannelUrlForm({
  control,
  onSubmit,
  isLoading,
}: ChannelUrlFormProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <View direction="row" gap={4}>
        <View.Item grow>
          <Controller
            name="url"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <TextField
                name="url"
                value={field.value}
                onChange={({ value }) => field.onChange(value)}
                placeholder="Enter are.na channel URL (e.g., https://www.are.na/dain-blodorn-kim/earth-s-objects)"
                inputAttributes={{ type: "url" }}
              />
            )}
          />
        </View.Item>
        <Button type="submit" color="primary" loading={isLoading}>
          Fetch Images
        </Button>
      </View>
    </form>
  );
}
