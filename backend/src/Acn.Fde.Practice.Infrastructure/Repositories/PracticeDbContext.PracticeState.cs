using Acn.Fde.Practice.Infrastructure.Persistence;

namespace Acn.Fde.Practice.Infrastructure.Repositories;

public partial class PracticeDbContext
{
    partial void AddGeneratedModels(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PracticeStateEntity>(entity =>
        {
            entity.ToTable("practice_state", "practice");
            entity.HasKey(state => state.UserId);
            entity.Property(state => state.UserId).HasColumnName("user_id").HasMaxLength(128);
            entity.Property(state => state.GitHubAccountId).HasColumnName("github_account_id").HasMaxLength(64);
            entity.Property(state => state.StateJson).HasColumnName("state").HasColumnType("jsonb")
                .HasConversion(JsonElementStringEfConverter.Default).IsRequired();
            entity.Property(state => state.ReceiptsJson).HasColumnName("receipts").HasColumnType("jsonb")
                .HasConversion(JsonElementStringEfConverter.Default).IsRequired();
            entity.Property(state => state.CreatedBy).HasColumnName("created_by").HasMaxLength(250).IsRequired();
            entity.Property(state => state.CreatedOn).HasColumnName("created_on").IsRequired();
            entity.Property(state => state.UpdatedBy).HasColumnName("updated_by").HasMaxLength(250).IsRequired();
            entity.Property(state => state.UpdatedOn).HasColumnName("updated_on").IsRequired();
        });
    }
}
