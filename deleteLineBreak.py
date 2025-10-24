import os  # Import os for path handling

# Read the input file
input_filename = 'trapping.txt'  # Change this to your source file

# Dynamically create output filename: insert ".after" before the extension
base, ext = os.path.splitext(input_filename)
output_filename = base + ".after" + ext

with open(input_filename, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove all newlines
clean_content = content.replace(". ", ".\n\n").replace("? ", "?\n\n")

# Save to the new file
with open(output_filename, 'w', encoding='utf-8') as f:
    f.write(clean_content)

print(f"Cleaned content saved to {output_filename}")